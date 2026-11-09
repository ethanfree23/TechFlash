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
      elsif txn.job_id != locked_job.id || !txn.technician_transfer?
        early = { error: "Transfer ledger row ownership mismatch; refusing payout." }
        next
      elsif txn.amount_cents.to_i != payout_amount.to_i
        early = { error: "Pending transfer amount does not match approved payout; refusing conflicting retry." }
        next
      end
    end
    return early if early

    allocation = persist_source_allocation!(txn, job: job, amount_cents: payout_amount)
    unless allocation[:safe]
      return { error: "Transfer blocked: #{allocation[:reason]} (unsafe source allocation)." }
    end

    source_charge_id = allocation[:charge_id]
    # Never send a PaymentIntent ID as source_transaction.
    if source_charge_id.present? && !source_charge_id.to_s.start_with?("ch_")
      return { error: "Transfer blocked: invalid_charge_id_shape (unsafe source allocation)." }
    end

    result = JobStripeOps.transfer!(
      amount_cents: payout_amount,
      destination: technician_profile.stripe_account_id,
      metadata: JobFundingService.stripe_metadata(job, txn).merge(
        "source_charge_id" => source_charge_id.to_s,
        "source_transaction_mode" => allocation[:mode].to_s,
        "source_allocation_reason" => allocation[:reason].to_s
      ),
      transfer_group: job.transfer_group,
      idempotency_key: key,
      source_transaction: source_charge_id
    )

    # Timeout / network ambiguity: retry once with identical idempotency params.
    # Stripe returns the original transfer for the same key when the first create succeeded.
    if !result.succeeded? && transient_stripe_failure?(result)
      result = JobStripeOps.transfer!(
        amount_cents: payout_amount,
        destination: technician_profile.stripe_account_id,
        metadata: JobFundingService.stripe_metadata(job, txn).merge(
          "source_charge_id" => source_charge_id.to_s,
          "source_transaction_mode" => allocation[:mode].to_s,
          "source_allocation_reason" => allocation[:reason].to_s
        ),
        transfer_group: job.transfer_group,
        idempotency_key: key,
        source_transaction: source_charge_id
      )
    end

    Job.transaction do
      locked_txn = JobPaymentTransaction.lock.find(txn.id)
      locked_payment = Payment.lock.find(payment.id)
      if locked_txn.status_succeeded?
        return { success: true, payment: locked_payment, transaction: locked_txn }
      end

      if result.succeeded?
        locked_txn.update!(
          status: :succeeded,
          stripe_transfer_id: result.stripe_id,
          source_charge_id: source_charge_id,
          bank_payout_status: "unknown",
          succeeded_at: Time.current,
          metadata_json: locked_txn.metadata_json.to_h.merge(
            "source_transaction" => source_charge_id,
            "source_transaction_mode" => allocation[:mode].to_s,
            "source_allocation_reason" => allocation[:reason].to_s,
            "bank_payout_status" => "unknown"
          )
        )
        locked_payment.update!(
          status: "released",
          stripe_transfer_id: result.stripe_id,
          released_at: Time.current,
          amount_cents: payout_amount
        )
        TimeEntry.where(job_id: job.id, status: TimeEntry.statuses[:approved]).update_all(
          status: TimeEntry.statuses[:paid],
          paid_at: Time.current,
          updated_at: Time.current
        )
        PaymentRiskEvent.create!(
          job: job,
          job_payment_transaction: locked_txn,
          risk_kind: "transfer_executed",
          investigation_status: "resolved",
          investigation_required: false,
          amount_cents: payout_amount,
          currency: "usd",
          stripe_transfer_id: result.stripe_id,
          stripe_connected_account_id: technician_profile.stripe_account_id,
          stripe_charge_id: source_charge_id,
          bank_payout_status: "unknown",
          admin_note: "Transfer created on Stripe Connect. Bank payout status unknown (not proven).",
          metadata_json: { "note" => "transfer_executed_is_not_bank_payout" },
          detected_at: Time.current,
          resolved_at: Time.current
        )

        MailDelivery.safe_deliver { UserMailer.payment_received_email(job, payout_amount).deliver_now }
        { success: true, payment: locked_payment, transaction: locked_txn }
      else
        locked_txn.update!(status: :failed, error_message: result.error)
        { error: result.error }
      end
    end
  rescue JobLedger::MissingCommissionSnapshotError => e
    { error: e.message }
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
  # source_transaction must be a Charge ID (ch_...), never a PaymentIntent ID.
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
    unless charge_id.start_with?("ch_")
      return blocked_decision("invalid_charge_id_shape", allocatable_cents: allocatable)
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
        JobPaymentTransaction.statuses[:processing]
      ])
    scope = scope.where.not(id: exclude_id) if exclude_id.present?
    scope.sum(:amount_cents).to_i
  end
end
