# frozen_string_literal: true

class PaymentService
  RELEASE_HOURS = JobSettlementService::RELEASE_HOURS

  class PaymentError < StandardError; end

  # Only genuine multi-charge jobs may use platform-balance transfers.
  SAFE_PLATFORM_BALANCE_REASONS = %w[multiple_source_charges].freeze

  def self.company_has_payment_method?(user)
    return true if defined?(DemoMode) && DemoMode.enabled?

    return false if user.blank?
    return false if Stripe.api_key.blank?

    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    return false if customer_id.blank?

    JobFundingService.default_payment_method_id(customer_id).present?
  rescue Stripe::StripeError
    false
  end

  def self.refund_payment(job)
    JobFundingAdjustmentService.refund_unfilled_job!(job)
  end

  def self.stripe_earnings_cents_for(technician_profile)
    return nil if technician_profile.blank? || technician_profile.stripe_account_id.blank?
    return nil if Stripe.api_key.blank?

    total = 0
    has_more = true
    starting_after = nil

    while has_more
      params = {
        destination: technician_profile.stripe_account_id,
        limit: 100
      }
      params[:starting_after] = starting_after if starting_after.present?

      list = Stripe::Transfer.list(params)
      list.data.each do |t|
        next if t.reversed

        amount_reversed = t.respond_to?(:amount_reversed) ? (t.amount_reversed || 0) : 0
        total += (t.amount || 0) - amount_reversed
      end
      has_more = list.has_more
      starting_after = list.data.last&.id if has_more && list.data.any?
    end

    total
  rescue Stripe::StripeError
    nil
  end

  def self.release_if_eligible(job)
    JobSettlementService.settle_and_release_if_eligible!(job)
  end

  def self.release_eligible?(job)
    JobSettlementService.release_eligible?(job)
  end

  def self.release_to_technician(payment)
    return { error: "No payment header" } if payment.blank?

    job = payment.job
    payout_amount = nil
    technician_profile = nil
    key = nil
    txn = nil
    early = nil

    Job.transaction do
      locked_job = Job.lock.find(job.id)
      if locked_job.technician_commission_percent_snapshot.nil? &&
          !locked_job.job_financial_revisions.where.not(technician_commission_percent: nil).exists?
        early = { error: "Technician commission snapshot is missing; refusing to transfer." }
        next
      end

      begin
        ledger = JobLedger.for(locked_job)
      rescue JobLedger::MissingCommissionSnapshotError => e
        early = { error: e.message }
        next
      end
      JobLedger.new(locked_job).technician_commission_percent!

      unless ledger.fully_funded
        early = { error: "Job is underfunded; technician payout is blocked." }
        next
      end
      # ACH safety: never transfer while a company collection/refund is still processing,
      # or while a funding charge is under dispute / return review.
      if locked_job.job_payment_transactions.company_collections.status_processing.exists?
        early = { error: "Company ACH payment is still processing; technician payout is blocked." }
        next
      end
      if locked_job.job_payment_transactions.company_refunds.status_processing.exists? ||
          locked_job.job_payment_transactions.company_refunds.status_pending.exists?
        early = { error: "Company refund is still pending; technician payout is blocked." }
        next
      end
      disputed = locked_job.job_payment_transactions.company_collections.status_succeeded.select(&:disputed?)
      if disputed.any?
        early = { error: "Company payment is disputed or returned; technician payout is blocked until resolved." }
        next
      end
      if defined?(PaymentRiskEvent) && PaymentRiskEvent.open_for_job?(locked_job)
        early = { error: "Unresolved financial risk on this job; technician payout is blocked pending admin review." }
        next
      end
      if ledger.technician_net_payout_cents.nil?
        early = { error: "Technician commission snapshot is missing; refusing to transfer." }
        next
      end

      # Idempotent recovery: return the existing succeeded transfer before the
      # transferred_cents guard so retries do not look like hard failures.
      existing = locked_job.job_payment_transactions.find_by(transaction_type: :technician_transfer, status: :succeeded)
      if existing
        early = { success: true, payment: payment, transaction: existing }
        next
      end
      if ledger.transferred_cents.positive?
        early = { error: "Technician payout already transferred." }
        next
      end

      accepted_app = locked_job.job_applications.find_by(status: :accepted)
      technician_profile = accepted_app&.technician_profile
      unless technician_profile
        early = { error: "No technician to pay" }
        next
      end
      if technician_profile.stripe_account_id.blank?
        early = { error: "Technician has no Stripe account" }
        next
      end
      unless StripeConnectAccountService.payout_ready?(technician_profile, sync: true)
        early = { error: "Technician Stripe Connect account is not ready to receive payouts." }
        next
      end

      payout_amount = ledger.technician_net_payout_cents
      if payout_amount.to_i <= 0
        early = { error: "No approved payable hours available for payout." }
        next
      end
      if payout_amount > ledger.net_funded_cents
        early = { error: "Payout exceeds funded amount." }
        next
      end

      key = "tf_job_#{locked_job.id}_txn_technician_transfer_r#{locked_job.financial_revision}"

      # Block only when a *different* transfer row is unresolved (never skip reconcile of this key).
      other_unknown = locked_job.job_payment_transactions
        .where(transaction_type: :technician_transfer, status: :outcome_unknown)
        .where.not(idempotency_key: key)
      if other_unknown.exists?
        early = { error: "Technician transfer outcome is unknown; reconcile Stripe before retrying payout." }
        next
      end

      txn = JobPaymentTransaction.lock.find_or_initialize_by(idempotency_key: key)
      if txn.new_record?
        txn.assign_attributes(
          payment: payment,
          job: locked_job,
          transaction_type: :technician_transfer,
          direction: :outbound,
          amount_cents: payout_amount,
          currency: "usd",
          status: :pending,
          revision: locked_job.financial_revision
        )
        txn.save!
      elsif txn.status_succeeded?
        early = { success: true, payment: payment, transaction: txn }
        next
      elsif txn.status_outcome_unknown?
        # Must reconcile before any create/retry — never blind re-create.
        early = :reconcile_required
        next
      elsif txn.job_id != locked_job.id || !txn.technician_transfer?
        early = { error: "Transfer ledger row ownership mismatch; refusing payout." }
        next
      elsif txn.amount_cents.to_i != payout_amount.to_i
        early = { error: "Pending transfer amount does not match approved payout; refusing conflicting retry." }
        next
      end
    end

    needs_admin_consume = false
    if early == :reconcile_required
      reconciled = reconcile_technician_transfer!(txn)
      return reconciled if reconciled[:success] || reconciled[:error] ||
        reconciled[:lookup_failed] || reconciled[:mismatch] ||
        reconciled[:requires_admin_authorization]

      unless reconciled[:allow_retry]
        return {
          error: reconciled[:message] || "Technician transfer reconcile did not authorize retry.",
          transaction: txn
        }
      end
      needs_admin_consume = reconciled[:admin_authorized] == true
      early = nil
    elsif early
      return early
    end

    allocation = persist_source_allocation!(txn, job: job, amount_cents: payout_amount)
    unless allocation[:safe]
      return { error: "Transfer blocked: #{allocation[:reason]} (unsafe source allocation)." }
    end

    source_charge_id = allocation[:charge_id]
    # Never send a PaymentIntent ID as source_transaction. Accept ch_ (card) and py_ (ACH).
    if source_charge_id.present? && !StripeChargeId.valid_shape?(source_charge_id)
      return { error: "Transfer blocked: invalid_charge_id_shape (unsafe source allocation)." }
    end
    if source_charge_id.present? && !StripeChargeId.matches_job_succeeded_charge?(source_charge_id, job)
      return { error: "Transfer blocked: mismatched_source_charge (unsafe source allocation)." }
    end

    transfer_metadata = JobFundingService.stripe_metadata(job, txn).merge(
      "source_charge_id" => source_charge_id.to_s,
      "source_transaction_mode" => allocation[:mode].to_s,
      "source_allocation_reason" => allocation[:reason].to_s
    )

    # Outside the 23h window: atomically consume single-use admin auth BEFORE create.
    consumed_auth = nil
    if needs_admin_consume || (!within_transfer_retry_window?(txn) && txn.status_outcome_unknown?)
      consume = consume_admin_transfer_authorization!(
        txn,
        destination: technician_profile.stripe_account_id,
        actor: nil
      )
      unless consume[:ok]
        return {
          error: consume[:error],
          requires_admin_authorization: consume[:requires_admin_authorization],
          lookup_failed: consume[:lookup_failed],
          transaction: txn.reload
        }
      end
      consumed_auth = consume[:authorization]
    end

    mark_transfer_first_attempted!(txn)

    result = JobStripeOps.transfer!(
      amount_cents: payout_amount,
      destination: technician_profile.stripe_account_id,
      metadata: transfer_metadata,
      transfer_group: job.transfer_group,
      idempotency_key: key,
      source_transaction: source_charge_id
    )
    # One same-key retry only for ambiguous/transient outcomes (still within same request).
    if !result.succeeded? && (result.outcome_unknown? || transient_stripe_failure?(result))
      result = JobStripeOps.transfer!(
        amount_cents: payout_amount,
        destination: technician_profile.stripe_account_id,
        metadata: transfer_metadata,
        transfer_group: job.transfer_group,
        idempotency_key: key,
        source_transaction: source_charge_id
      )
    end

    out = apply_transfer_result!(
      payment: payment,
      txn: txn,
      job: job,
      technician_profile: technician_profile,
      payout_amount: payout_amount,
      source_charge_id: source_charge_id,
      allocation: allocation,
      result: result
    )
    if consumed_auth
      record_transfer_auth_audit!(
        authorization: consumed_auth,
        txn: txn,
        event: "create_attempted",
        decision: "executed",
        lookup_outcome: "not_found_after_complete_search",
        final_outcome: result.status.to_s,
        actor: consumed_auth.granted_by_user,
        reason: consumed_auth.reason,
        acknowledged: consumed_auth.acknowledged_prior_timeout_risk,
        metadata: { "stripe_id" => result.stripe_id, "error" => result.error }
      )
    end
    out
  rescue JobLedger::MissingCommissionSnapshotError => e
    { error: e.message }
  end

  def self.apply_transfer_result!(payment:, txn:, job:, technician_profile:, payout_amount:, source_charge_id:, allocation:, result:)
    Job.transaction do
      locked_txn = JobPaymentTransaction.lock.find(txn.id)
      locked_payment = Payment.lock.find(payment.id)
      if locked_txn.status_succeeded?
        return { success: true, payment: locked_payment, transaction: locked_txn }
      end

      if result.succeeded?
        finalize_succeeded_transfer!(
          locked_txn: locked_txn,
          locked_payment: locked_payment,
          job: job,
          technician_profile: technician_profile,
          payout_amount: payout_amount,
          source_charge_id: source_charge_id,
          allocation: allocation,
          stripe_transfer_id: result.stripe_id
        )
      elsif result.outcome_unknown? || transient_stripe_failure?(result)
        # Do NOT mark failed — Stripe may have created the transfer.
        attrs = {
          status: :outcome_unknown,
          error_message: result.error,
          source_charge_id: source_charge_id,
          investigation_required: true,
          metadata_json: locked_txn.metadata_json.to_h.merge(
            "stripe_outcome" => "unknown",
            "stripe_error_class" => result.error_class,
            "source_transaction" => source_charge_id,
            "source_transaction_mode" => allocation[:mode].to_s,
            "source_allocation_reason" => allocation[:reason].to_s,
            "needs_reconcile" => true
          )
        }
        attrs[:transfer_first_attempted_at] = Time.current if locked_txn.transfer_first_attempted_at.blank?
        locked_txn.update!(attrs)
        {
          error: "Stripe transfer outcome unknown (#{result.error}). Funds remain reserved; reconcile before retry.",
          outcome_unknown: true,
          transaction: locked_txn
        }
      else
        attrs = { status: :failed, error_message: result.error }
        attrs[:transfer_first_attempted_at] = Time.current if locked_txn.transfer_first_attempted_at.blank?
        locked_txn.update!(attrs)
        { error: result.error }
      end
    end
  end

  def self.finalize_succeeded_transfer!(locked_txn:, locked_payment:, job:, technician_profile:, payout_amount:, source_charge_id:, allocation:, stripe_transfer_id:)
    meta = locked_txn.metadata_json.to_h
      .merge(
        "source_transaction" => source_charge_id,
        "source_transaction_mode" => allocation[:mode].to_s,
        "source_allocation_reason" => allocation[:reason].to_s,
        "bank_payout_status" => "unknown",
        "needs_reconcile" => false,
        "lookup_failed" => false,
        "transfer_mismatch" => false
      )
      .except("mismatch_fields", "candidate_stripe_transfer_id")
    locked_txn.update!(
      status: :succeeded,
      stripe_transfer_id: stripe_transfer_id,
      source_charge_id: source_charge_id,
      bank_payout_status: "unknown",
      succeeded_at: Time.current,
      investigation_required: false,
      error_message: nil,
      transfer_first_attempted_at: locked_txn.transfer_first_attempted_at || Time.current,
      metadata_json: meta
    )
    locked_payment.update!(
      status: "released",
      stripe_transfer_id: stripe_transfer_id,
      released_at: Time.current,
      amount_cents: payout_amount
    )
    TimeEntry.where(job_id: job.id, status: TimeEntry.statuses[:approved]).update_all(
      status: TimeEntry.statuses[:paid],
      paid_at: Time.current,
      updated_at: Time.current
    )
    unless PaymentRiskEvent.where(job_id: job.id, stripe_transfer_id: stripe_transfer_id, risk_kind: "transfer_executed").exists?
      PaymentRiskEvent.create!(
        job: job,
        job_payment_transaction: locked_txn,
        risk_kind: "transfer_executed",
        investigation_status: "resolved",
        investigation_required: false,
        correlation_key: "transfer:#{stripe_transfer_id}",
        amount_cents: payout_amount,
        currency: "usd",
        stripe_transfer_id: stripe_transfer_id,
        stripe_connected_account_id: technician_profile&.stripe_account_id,
        stripe_charge_id: source_charge_id,
        bank_payout_status: "unknown",
        admin_note: "Transfer created on Stripe Connect. Bank payout status unknown (not proven).",
        metadata_json: { "note" => "transfer_executed_is_not_bank_payout" },
        detected_at: Time.current,
        resolved_at: Time.current
      )
    end

    MailDelivery.safe_deliver { UserMailer.payment_received_email(job, payout_amount).deliver_now }
    { success: true, payment: locked_payment, transaction: locked_txn }
  end

  # Stay clear of Stripe idempotency-key pruning at >=24h — auto retry only inside 23h.
  TRANSFER_IDEMPOTENCY_SAFE_WINDOW = 23.hours

  def self.mark_transfer_first_attempted!(txn)
    return if txn.transfer_first_attempted_at.present?

    txn.update!(transfer_first_attempted_at: Time.current)
  end

  def self.within_transfer_retry_window?(txn)
    attempted = txn.transfer_first_attempted_at
    return false if attempted.blank?

    attempted > TRANSFER_IDEMPOTENCY_SAFE_WINDOW.ago
  end

  def self.record_transfer_auth_audit!(authorization:, txn:, event:, decision:, lookup_outcome:, final_outcome:, actor:, reason:, acknowledged:, metadata: {})
    TransferRetryAuthorizationAudit.create!(
      job_payment_transaction_id: txn.id,
      transfer_retry_authorization_id: authorization&.id,
      actor_user_id: actor&.id,
      actor_email: actor&.email || authorization&.granted_by_email,
      event: event,
      reason: reason,
      acknowledged_prior_timeout_risk: acknowledged,
      lookup_outcome: lookup_outcome,
      decision: decision,
      final_outcome: final_outcome,
      metadata_json: metadata,
      created_at: Time.current
    )
  end

  # Grant a single-use admin authorization after a complete not-found lookup.
  def self.grant_admin_transfer_authorization!(txn, actor:, reason:, acknowledged_prior_timeout_risk:)
    reason_text = reason.to_s.strip
    raise ArgumentError, "reason is required" if reason_text.blank?
    unless ActiveModel::Type::Boolean.new.cast(acknowledged_prior_timeout_risk)
      raise ArgumentError, "acknowledged_prior_timeout_risk must be true"
    end

    auth = TransferRetryAuthorization.create!(
      job_payment_transaction: txn,
      granted_by_user_id: actor&.id,
      granted_by_email: actor&.email || actor.to_s,
      reason: reason_text,
      acknowledged_prior_timeout_risk: true,
      granted_at: Time.current,
      expires_at: TransferRetryAuthorization::TTL.from_now,
      status: "granted",
      lookup_outcome_at_grant: "not_found_after_complete_search",
      token: SecureRandom.uuid,
      metadata_json: {}
    )
    record_transfer_auth_audit!(
      authorization: auth,
      txn: txn,
      event: "granted",
      decision: "authorize_retry",
      lookup_outcome: "not_found_after_complete_search",
      final_outcome: "pending_consume",
      actor: actor.is_a?(User) ? actor : nil,
      reason: reason_text,
      acknowledged: true
    )
    auth
  end

  # Atomically consume an active grant AFTER a fresh complete not-found lookup.
  # Must run immediately before Stripe create. Concurrent second consume fails.
  def self.consume_admin_transfer_authorization!(txn, destination:, actor: nil)
    lookup = JobStripeOps.find_transfer_for_transaction(
      destination: destination,
      transfer_group: txn.job.transfer_group,
      transaction_id: txn.id,
      job_id: txn.job_id
    )

    if lookup.lookup_failed?
      record_transfer_auth_audit!(
        authorization: TransferRetryAuthorization.active.where(job_payment_transaction_id: txn.id).first,
        txn: txn,
        event: "refused_lookup_failed",
        decision: "refuse",
        lookup_outcome: "lookup_failed",
        final_outcome: "blocked",
        actor: actor,
        reason: nil,
        acknowledged: nil,
        metadata: { "error" => lookup.error }
      )
      return { ok: false, lookup_failed: true, error: "Stripe transfer lookup failed before authorized create; refused." }
    end

    if lookup.found?
      validation = validate_recovered_transfer(lookup.transfer, txn, destination: destination)
      unless validation[:ok]
        flag_transfer_mismatch!(txn, transfer: lookup.transfer, mismatches: validation[:mismatches])
        return { ok: false, mismatch: true, error: "Recovered transfer mismatch; create blocked." }
      end
      return { ok: false, found: true, error: "Matching Stripe transfer already exists; create blocked (reconcile instead)." }
    end

    unless lookup.not_found_after_complete_search?
      return { ok: false, error: "Unexpected lookup status before authorized create: #{lookup.status}" }
    end

    auth = nil
    TransferRetryAuthorization.transaction do
      auth = TransferRetryAuthorization.lock
        .active
        .where(job_payment_transaction_id: txn.id)
        .order(granted_at: :desc)
        .first
      unless auth
        return {
          ok: false,
          requires_admin_authorization: true,
          error: "No active admin authorization for this transfer retry."
        }
      end

      updated = TransferRetryAuthorization.where(id: auth.id, status: "granted", consumed_at: nil)
        .where("expires_at > ?", Time.current)
        .update_all(
          status: "consumed",
          consumed_at: Time.current,
          consumed_by_user_id: actor&.id,
          updated_at: Time.current
        )
      if updated != 1
        record_transfer_auth_audit!(
          authorization: auth,
          txn: txn,
          event: "refused_already_consumed",
          decision: "refuse",
          lookup_outcome: "not_found_after_complete_search",
          final_outcome: "blocked",
          actor: actor,
          reason: auth.reason,
          acknowledged: auth.acknowledged_prior_timeout_risk
        )
        return {
          ok: false,
          requires_admin_authorization: true,
          error: "Admin authorization already consumed or expired; refused."
        }
      end
      auth.reload
    end

    record_transfer_auth_audit!(
      authorization: auth,
      txn: txn,
      event: "consumed",
      decision: "authorize_create",
      lookup_outcome: "not_found_after_complete_search",
      final_outcome: "pending_stripe_create",
      actor: actor,
      reason: auth.reason,
      acknowledged: auth.acknowledged_prior_timeout_risk
    )
    { ok: true, authorization: auth }
  end

  def self.active_admin_authorization?(txn)
    TransferRetryAuthorization.active.where(job_payment_transaction_id: txn.id).exists?
  end

  # Validate a Stripe transfer recovered via list/webhook against the local ledger row.
  def self.validate_recovered_transfer(transfer, txn, destination:)
    meta = transfer.respond_to?(:metadata) ? transfer.metadata.to_h.transform_keys(&:to_s) : {}
    mismatches = []
    amount = transfer.respond_to?(:amount) ? transfer.amount.to_i : nil
    currency = transfer.respond_to?(:currency) ? transfer.currency.to_s.downcase : nil
    dest = transfer.respond_to?(:destination) ? transfer.destination.to_s : nil
    group = transfer.respond_to?(:transfer_group) ? transfer.transfer_group.to_s : nil

    mismatches << "amount" unless amount == txn.amount_cents.to_i
    mismatches << "currency" unless currency == txn.currency.to_s.downcase
    mismatches << "destination" unless dest == destination.to_s
    mismatches << "transfer_group" unless group == txn.job.transfer_group.to_s
    mismatches << "transaction_id" unless meta["transaction_id"].to_s == txn.id.to_s
    mismatches << "job_id" unless meta["job_id"].to_s == txn.job_id.to_s
    mismatches << "revision" unless meta["revision"].to_s == txn.revision.to_s

    { ok: mismatches.empty?, mismatches: mismatches }
  end

  def self.flag_transfer_mismatch!(txn, transfer:, mismatches:)
    txn.update!(
      status: :outcome_unknown,
      investigation_required: true,
      error_message: "Recovered Stripe transfer mismatch: #{mismatches.join(', ')}",
      metadata_json: txn.metadata_json.to_h.merge(
        "needs_reconcile" => true,
        "transfer_mismatch" => true,
        "mismatch_fields" => mismatches,
        "candidate_stripe_transfer_id" => (transfer.respond_to?(:id) ? transfer.id : nil),
        "flagged_at" => Time.current.iso8601
      )
    )
  end

  # Reconcile an outcome_unknown (or pending) technician transfer against Stripe.
  # Admin-triggerable and required before any later create/retry.
  #
  # admin_authorize_retry: explicit admin grant after a complete not-found lookup when
  # first attempt is >= 23h old. Requires reason + acknowledged_prior_timeout_risk.
  # Grant is single-use and must be consumed atomically before Stripe create.
  def self.reconcile_technician_transfer!(
    txn,
    admin_authorize_retry: false,
    actor: nil,
    reason: nil,
    acknowledged_prior_timeout_risk: false
  )
    return { error: "Not a technician transfer" } unless txn&.technician_transfer?
    return { success: true, transaction: txn, payment: txn.payment } if txn.status_succeeded?

    job = txn.job
    payment = txn.payment
    accepted = job.job_applications.find_by(status: :accepted)
    tech = accepted&.technician_profile
    destination = tech&.stripe_account_id
    if destination.blank?
      return { error: "Cannot reconcile: technician Stripe account missing." }
    end

    lookup = JobStripeOps.find_transfer_for_transaction(
      destination: destination,
      transfer_group: job.transfer_group,
      transaction_id: txn.id,
      job_id: job.id
    )

    if lookup.lookup_failed?
      txn.update!(
        status: :outcome_unknown,
        investigation_required: true,
        error_message: "Stripe transfer lookup failed: #{lookup.error}",
        metadata_json: txn.metadata_json.to_h.merge(
          "needs_reconcile" => true,
          "lookup_failed" => true,
          "lookup_error" => lookup.error,
          "lookup_failed_at" => Time.current.iso8601
        )
      )
      return {
        error: "Stripe transfer lookup failed (#{lookup.error}). Transfer remains outcome_unknown; create blocked.",
        lookup_failed: true,
        outcome_unknown: true,
        allow_retry: false,
        transaction: txn.reload
      }
    end

    if lookup.found?
      validation = validate_recovered_transfer(lookup.transfer, txn, destination: destination)
      unless validation[:ok]
        flag_transfer_mismatch!(txn, transfer: lookup.transfer, mismatches: validation[:mismatches])
        return {
          error: "Recovered Stripe transfer does not match local transaction (#{validation[:mismatches].join(', ')}). Flagged for investigation; create blocked.",
          mismatch: true,
          mismatches: validation[:mismatches],
          allow_retry: false,
          outcome_unknown: true,
          transaction: txn.reload
        }
      end

      allocation = persist_source_allocation!(txn, job: job, amount_cents: txn.amount_cents)
      result = apply_transfer_result!(
        payment: payment,
        txn: txn,
        job: job,
        technician_profile: tech,
        payout_amount: txn.amount_cents,
        source_charge_id: allocation[:charge_id] || txn.source_charge_id,
        allocation: allocation,
        result: JobStripeOps::Result.new(status: "succeeded", stripe_id: lookup.transfer.id)
      )
      return result.merge(reconciled: true, created: false, found: true)
    end

    unless lookup.not_found_after_complete_search?
      return {
        error: "Unexpected Stripe lookup status: #{lookup.status}",
        allow_retry: false,
        transaction: txn
      }
    end

    if within_transfer_retry_window?(txn)
      return {
        found: false,
        allow_retry: true,
        transaction: txn,
        message: "No matching Stripe transfer found within 23h idempotency-safe window; same-key retry allowed with identical persisted allocation."
      }
    end

    # >= 23h (or missing first-attempt timestamp): never auto re-create.
    if admin_authorize_retry
      begin
        auth = grant_admin_transfer_authorization!(
          txn,
          actor: actor,
          reason: reason,
          acknowledged_prior_timeout_risk: acknowledged_prior_timeout_risk
        )
      rescue ArgumentError => e
        return { error: e.message, allow_retry: false, requires_admin_authorization: true }
      end
      return {
        found: false,
        allow_retry: true,
        admin_authorized: true,
        authorization_id: auth.id,
        transaction: txn.reload,
        message: "Admin granted single-use retry authorization after complete not-found lookup outside 23h window. Authorization must be consumed before create."
      }
    end

    if active_admin_authorization?(txn)
      return {
        found: false,
        allow_retry: true,
        admin_authorized: true,
        transaction: txn,
        message: "Active single-use admin authorization present; same-key retry may proceed (will consume atomically before create)."
      }
    end

    {
      found: false,
      allow_retry: false,
      requires_admin_authorization: true,
      error: "No matching Stripe transfer found, but first attempt is outside the 23h idempotency-safe window. Explicit admin reconciliation + authorization (reason + acknowledgment) required before any create.",
      transaction: txn
    }
  end

  # Webhook: platform transfer.created / transfer.updated resolves outcome_unknown rows.
  def self.reconcile_transfer_from_stripe_object!(transfer)
    meta = transfer.respond_to?(:metadata) ? transfer.metadata.to_h.transform_keys(&:to_s) : {}
    txn_id = meta["transaction_id"].presence
    txn = JobPaymentTransaction.find_by(id: txn_id) if txn_id
    txn ||= JobPaymentTransaction.find_by(stripe_transfer_id: transfer.id)
    return nil if txn.blank?
    return txn if txn.status_succeeded?

    if txn.technician_transfer? && (txn.status_outcome_unknown? || txn.status_pending? || txn.status_processing?)
      tech = txn.job.job_applications.find_by(status: :accepted)&.technician_profile
      destination = tech&.stripe_account_id.to_s
      validation = validate_recovered_transfer(transfer, txn, destination: destination)
      unless validation[:ok]
        flag_transfer_mismatch!(txn, transfer: transfer, mismatches: validation[:mismatches])
        return txn.reload
      end

      allocation = persist_source_allocation!(txn, job: txn.job, amount_cents: txn.amount_cents)
      apply_transfer_result!(
        payment: txn.payment,
        txn: txn,
        job: txn.job,
        technician_profile: tech,
        payout_amount: txn.amount_cents,
        source_charge_id: allocation[:charge_id] || txn.source_charge_id,
        allocation: allocation,
        result: JobStripeOps::Result.new(status: "succeeded", stripe_id: transfer.id)
      )
    end
    txn.reload
  end

  # Persist a stable allocation decision on the pending transfer so Stripe idempotency
  # retries always reuse identical source_transaction parameters.
  def self.persist_source_allocation!(txn, job:, amount_cents:)
    meta = txn.metadata_json.to_h
    cached = meta["source_allocation"]
    if cached.is_a?(Hash) && cached["reason"].present? && cached.key?("safe")
      return {
        charge_id: cached["charge_id"].presence,
        mode: cached["mode"],
        reason: cached["reason"],
        safe: ActiveModel::Type::Boolean.new.cast(cached["safe"]),
        allocatable_cents: cached["allocatable_cents"]
      }.symbolize_keys
    end

    decision = source_transaction_decision(
      job,
      amount_cents: amount_cents,
      exclude_transfer_id: txn.id
    )
    txn.update!(
      metadata_json: meta.merge(
        "source_allocation" => {
          "charge_id" => decision[:charge_id],
          "mode" => decision[:mode],
          "reason" => decision[:reason],
          "safe" => decision[:safe],
          "allocatable_cents" => decision[:allocatable_cents],
          "decided_at" => Time.current.iso8601
        }
      )
    )
    decision
  end

  def self.transient_stripe_failure?(result)
    msg = result.error.to_s
    return false if msg.blank?

    msg.match?(/timeout|timed out|connection|temporarily|503|500|network/i)
  end

  # Prefer source_transaction only for a demonstrably single-charge funded job with
  # sufficient unallocated Charge funds. Multi-charge → safe Option B (platform balance).
  # Unsafe conditions return mode: "blocked" (caller must not transfer).
  # source_transaction must be a Charge ID (ch_… or ACH py_…), never a PaymentIntent ID.
  def self.source_charge_for_transfer(job, amount_cents: nil, exclude_transfer_id: nil)
    decision = source_transaction_decision(job, amount_cents: amount_cents, exclude_transfer_id: exclude_transfer_id)
    return nil unless decision[:safe]

    decision[:charge_id]
  end

  # Returns { charge_id:, mode:, reason:, safe:, allocatable_cents?: }
  # mode: "single_charge" | "platform_balance" | "blocked"
  def self.source_transaction_decision(job, amount_cents: nil, exclude_transfer_id: nil)
    exclude_id = validate_exclude_transfer_id!(job, exclude_transfer_id)

    collections = job.job_payment_transactions.company_collections.status_succeeded.order(:id).to_a
    if collections.empty?
      return blocked_decision("no_succeeded_collections")
    end

    # Missing Charge IDs are unsafe — do not invent platform-balance funding.
    if collections.any? { |t| t.stripe_charge_id.to_s.strip.blank? }
      return blocked_decision("collection_missing_charge_id")
    end

    charge_ids = collections.map { |t| t.stripe_charge_id.to_s.strip }.uniq
    currencies = collections.map { |t| t.currency.to_s.downcase.presence || "usd" }.uniq
    if currencies.size != 1 || currencies.first != "usd"
      return blocked_decision("currency_mismatch")
    end

    collected = collections.sum { |t| t.amount_cents.to_i }
    reserved_refunds = reserved_refund_cents(job)
    reserved_transfers = reserved_transfer_cents(job, exclude_id: exclude_id)
    allocatable = collected - reserved_refunds - reserved_transfers
    planned = amount_cents.nil? ? allocatable : amount_cents.to_i

    if planned <= 0
      return blocked_decision("non_positive_transfer_amount", allocatable_cents: allocatable)
    end
    if planned > allocatable
      return blocked_decision("insufficient_allocatable_source", allocatable_cents: allocatable)
    end

    # Genuine multi-charge job with complete Charge IDs and sufficient unallocated funding.
    if charge_ids.size != 1
      return {
        charge_id: nil,
        mode: "platform_balance",
        reason: "multiple_source_charges",
        safe: true,
        allocatable_cents: allocatable
      }
    end

    charge_id = charge_ids.first
    unless StripeChargeId.valid_shape?(charge_id)
      return blocked_decision("invalid_charge_id_shape", allocatable_cents: allocatable)
    end
    unless StripeChargeId.matches_job_succeeded_charge?(charge_id, job)
      return blocked_decision("mismatched_source_charge", allocatable_cents: allocatable)
    end

    {
      charge_id: charge_id,
      mode: "single_charge",
      reason: "ok",
      safe: true,
      allocatable_cents: allocatable
    }
  end

  def self.blocked_decision(reason, allocatable_cents: nil)
    {
      charge_id: nil,
      mode: "blocked",
      reason: reason,
      safe: false,
      allocatable_cents: allocatable_cents
    }
  end

  def self.validate_exclude_transfer_id!(job, exclude_transfer_id)
    return nil if exclude_transfer_id.blank?

    txn = job.job_payment_transactions.find_by(id: exclude_transfer_id)
    if txn.nil?
      raise PaymentError, "exclude_transfer_id=#{exclude_transfer_id} does not belong to job #{job.id}"
    end
    unless txn.technician_transfer?
      raise PaymentError, "exclude_transfer_id=#{exclude_transfer_id} is not a technician_transfer"
    end

    txn.id
  end

  def self.reserved_refund_cents(job)
    job.job_payment_transactions.company_refunds
      .where(status: [
        JobPaymentTransaction.statuses[:succeeded],
        JobPaymentTransaction.statuses[:pending],
        JobPaymentTransaction.statuses[:processing],
        JobPaymentTransaction.statuses[:requires_action]
      ])
      .sum(:amount_cents).to_i
  end

  def self.reserved_transfer_cents(job, exclude_id: nil)
    scope = job.job_payment_transactions
      .where(transaction_type: JobPaymentTransaction.transaction_types[:technician_transfer])
      .where(status: [
        JobPaymentTransaction.statuses[:succeeded],
        JobPaymentTransaction.statuses[:pending],
        JobPaymentTransaction.statuses[:processing],
        JobPaymentTransaction.statuses[:outcome_unknown]
      ])
    scope = scope.where.not(id: exclude_id) if exclude_id.present?
    scope.sum(:amount_cents).to_i
  end
end
