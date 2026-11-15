# frozen_string_literal: true

# Reconciles a company collection (JobPaymentTransaction) whose Stripe PaymentIntent outcome
# is unknown: the create call timed out, the connection dropped, Stripe returned 5xx, or the
# process died between stamping the attempt and recording Stripe's answer.
#
# Policy (mirrors the technician-transfer reconciliation precedent):
#   1. Recover the original PaymentIntent — by stored ID, else by a complete list of the
#      customer's PaymentIntents since the first attempt, matched on metadata.transaction_id.
#   2. A lookup error or capped/incomplete search is NOT proof that no PaymentIntent exists:
#      the row stays outcome_unknown and nothing may be created.
#   3. Found + verified → apply Stripe's authoritative state (succeeded / processing /
#      requires_action / definitive failure). Found but mismatched → flag, never apply.
#   4. Not found after a complete search:
#        - inside SAFE_RETRY_WINDOW of the first attempt → the SAME idempotency key may be
#          retried (Stripe replays the original request if it did reach them);
#        - outside the window → audited admin review; no automatic create.
#   outcome_unknown never counts as funding and never authorizes work or transfers
#   (JobLedger sums succeeded rows only).
class CollectionOutcomeReconciler
  # Stripe idempotency keys replay the original request for 24h; keep a margin.
  SAFE_RETRY_WINDOW = 23.hours
  RISK_KIND = "collection_outcome_unknown"

  OUTCOMES = %w[
    resolved_succeeded
    resolved_processing
    resolved_requires_action
    resolved_failed
    retry_same_key_allowed
    requires_admin_review
    lookup_failed
    mismatch
    not_applicable
  ].freeze

  Decision = Struct.new(:outcome, :transaction, :message, :error, :mismatches, :lookup_status, keyword_init: true) do
    OUTCOMES.each do |name|
      define_method("#{name}?") { outcome.to_s == name }
    end

    def resolved?
      outcome.to_s.start_with?("resolved_")
    end
  end

  def self.correlation_key_for(txn)
    "collection_unknown:#{txn.id}"
  end

  def self.within_safe_retry_window?(txn)
    first = txn.collection_first_attempted_at
    return false if first.blank?

    first > SAFE_RETRY_WINDOW.ago
  end

  # Age-derived classification for monitoring: pending while a same-key retry is still safe,
  # requires_admin once the window has lapsed (or the first attempt was never stamped).
  def self.reconciliation_state(txn)
    return "reconciled" if txn.status_succeeded? || txn.status_processing? || txn.status_requires_action?
    return "requires_admin" if txn.metadata_json.to_h["requires_admin_review"] == true

    within_safe_retry_window?(txn) ? "pending_reconciliation" : "requires_admin"
  end

  # Reconcile one collection. Only pending (attempt stamped), outcome_unknown, and failed rows
  # are eligible; anything else is returned as not_applicable without a Stripe call.
  #
  # admin_mark_failed: after a complete not-found search outside the safe window, an admin may
  # close the attempt as a definitive failure (audited; reason required). Never automatic.
  def self.reconcile!(txn, admin_mark_failed: false, actor: nil, reason: nil)
    txn = JobPaymentTransaction.find(txn.id)
    return Decision.new(outcome: "not_applicable", transaction: txn, message: "Not a company collection") unless collection?(txn)
    return Decision.new(outcome: "resolved_succeeded", transaction: txn) if txn.status_succeeded?
    return Decision.new(outcome: "not_applicable", transaction: txn, message: "Transaction is #{txn.status}") if txn.status_canceled?
    # processing / requires_action rows always carry a PaymentIntent id; they may be refreshed
    # from Stripe here (normally webhooks do it), but only ever forward.
    if txn.status_pending? && txn.collection_first_attempted_at.blank?
      return Decision.new(outcome: "not_applicable", transaction: txn, message: "No Stripe attempt has been made yet")
    end

    lookup = lookup_payment_intent(txn)

    if lookup.lookup_failed?
      record_lookup_failure!(txn, lookup)
      return Decision.new(
        outcome: "lookup_failed",
        transaction: txn.reload,
        lookup_status: lookup.status,
        error: "Stripe PaymentIntent lookup failed (#{lookup.error}). Outcome remains unknown; no new attempt may be created.",
        message: "Lookup failed; retry reconciliation later."
      )
    end

    if lookup.found?
      pi = lookup.payment_intent
      mismatches = intent_mismatches(pi, txn)
      if mismatches.any?
        flag_mismatch!(txn, pi, mismatches)
        return Decision.new(
          outcome: "mismatch",
          transaction: txn.reload,
          lookup_status: lookup.status,
          mismatches: mismatches,
          error: "Recovered PaymentIntent #{pi.id} does not match the local transaction (#{mismatches.join(', ')}). Flagged for investigation; no new attempt may be created."
        )
      end

      return apply_intent_state!(txn, pi)
    end

    unless lookup.not_found_after_complete_search?
      return Decision.new(outcome: "lookup_failed", transaction: txn, lookup_status: lookup.status, error: "Unexpected lookup status #{lookup.status}")
    end

    if within_safe_retry_window?(txn)
      note!(txn, "complete_not_found_within_window", lookup_status: lookup.status)
      return Decision.new(
        outcome: "retry_same_key_allowed",
        transaction: txn.reload,
        lookup_status: lookup.status,
        message: "No PaymentIntent found after a complete search and the first attempt is within #{SAFE_RETRY_WINDOW.inspect}; the same idempotency key may be retried."
      )
    end

    if admin_mark_failed
      return admin_close_as_failed!(txn, actor: actor, reason: reason, lookup_status: lookup.status)
    end

    mark_requires_admin_review!(txn, lookup_status: lookup.status)
    Decision.new(
      outcome: "requires_admin_review",
      transaction: txn.reload,
      lookup_status: lookup.status,
      error: "No PaymentIntent found after a complete search, but the first attempt is outside the #{SAFE_RETRY_WINDOW.inspect} idempotency-safe window. Admin reconciliation (reason + explicit close) is required before any new attempt."
    )
  end

  # ---- Stripe lookup --------------------------------------------------------------------------

  def self.lookup_payment_intent(txn)
    if txn.stripe_payment_intent_id.present?
      return JobStripeOps.retrieve_payment_intent(txn.stripe_payment_intent_id)
    end

    customer_id = txn.job.company_profile&.user&.stripe_customer_id
    JobStripeOps.find_payment_intent_for_attempt(
      customer_id: customer_id,
      metadata_key: "transaction_id",
      metadata_value: txn.id,
      created_after: txn.collection_first_attempted_at || txn.created_at,
      extra_metadata: { "job_id" => txn.job_id }
    )
  end

  # Ownership / identity checks between a Stripe PaymentIntent and a local collection row.
  # Every available field must agree; absent Stripe fields are not treated as mismatches.
  def self.intent_mismatches(pi, txn)
    mismatches = []
    meta = stripe_metadata(pi)

    amount = field(pi, "amount")
    mismatches << "amount" if amount.present? && amount.to_i != txn.amount_cents.to_i

    currency = field(pi, "currency")
    mismatches << "currency" if currency.present? && !currency.to_s.casecmp?(txn.currency.to_s)

    if meta["transaction_id"].present? && meta["transaction_id"].to_s != txn.id.to_s
      mismatches << "metadata.transaction_id"
    end
    if meta["job_id"].present? && meta["job_id"].to_s != txn.job_id.to_s
      mismatches << "metadata.job_id"
    end
    if meta["payment_id"].present? && meta["payment_id"].to_s != txn.payment_id.to_s
      mismatches << "metadata.payment_id"
    end
    if meta["techflash_internal_smoke_test"].to_s == "true"
      mismatches << "internal_smoke_test_intent"
    end

    stored_pi = txn.stripe_payment_intent_id.presence
    pi_id = field(pi, "id")
    mismatches << "payment_intent_id" if stored_pi && pi_id.present? && stored_pi != pi_id.to_s

    customer = field(pi, "customer")
    expected_customer = txn.job.company_profile&.user&.stripe_customer_id.presence
    if customer.present? && expected_customer && customer.to_s != expected_customer
      mismatches << "customer"
    end

    mismatches
  end

  # ---- Applying authoritative Stripe state ----------------------------------------------------

  def self.apply_intent_state!(txn, pi)
    status = field(pi, "status").to_s
    case status
    when "succeeded"
      apply_succeeded!(txn, pi)
    when "processing"
      apply_processing!(txn, pi)
    when "requires_action"
      apply_requires_action!(txn, pi)
    when "canceled", "requires_payment_method"
      apply_definitive_failure!(txn, pi)
    else
      # requires_confirmation / requires_capture / unknown: not authoritative for a collection.
      note!(txn, "indeterminate_intent_status", stripe_status: status, payment_intent_id: field(pi, "id"))
      Decision.new(
        outcome: "lookup_failed",
        transaction: txn.reload,
        error: "PaymentIntent #{field(pi, 'id')} is in state #{status.inspect}; not authoritative. Outcome remains unknown."
      )
    end
  end

  def self.apply_succeeded!(txn, pi)
    job = nil
    Job.transaction do
      job = Job.lock.find(txn.job_id)
      locked = JobPaymentTransaction.lock.find(txn.id)
      unless locked.status_succeeded?
        previous = locked.status
        JobFundingService.apply_successful_intent!(job: job, txn: locked, intent: pi)
        locked.reload
        locked.update!(
          investigation_required: false,
          metadata_json: locked.metadata_json.to_h.merge(
            "recovered_from" => previous,
            "recovered_via" => "reconcile",
            "recovered_at" => Time.current.iso8601
          )
        )
        resolve_risk_event!(locked, note: "Reconciled: Stripe PaymentIntent succeeded.")
      end
    end
    JobAlertDispatcher.dispatch_for_job(job.reload) if job&.effectively_open?
    Decision.new(outcome: "resolved_succeeded", transaction: txn.reload, message: "PaymentIntent succeeded; collection recorded.")
  end

  def self.apply_processing!(txn, pi)
    Job.transaction do
      job = Job.lock.find(txn.job_id)
      locked = JobPaymentTransaction.lock.find(txn.id)
      next if locked.status_succeeded? || locked.status_processing?

      previous = locked.status
      JobFundingService.mark_txn_processing!(
        locked,
        stripe_id: field(pi, "id"),
        charge_id: field(pi, "latest_charge").presence
      )
      locked.update!(
        investigation_required: false,
        metadata_json: locked.metadata_json.to_h.merge(
          "recovered_from" => previous,
          "recovered_via" => "reconcile",
          "recovered_at" => Time.current.iso8601
        )
      )
      resolve_risk_event!(locked, note: "Reconciled: Stripe PaymentIntent processing.")
      if locked.initial_job_charge? || locked.counteroffer_top_up? || locked.final_hours_top_up?
        attrs = { funding_status: :adjustment_required }
        attrs[:status] = :pending_funding if locked.initial_job_charge? && !job.filled? && !job.finished? && !job.reserved?
        job.update!(attrs)
      end
    end
    Decision.new(outcome: "resolved_processing", transaction: txn.reload, message: "PaymentIntent is processing; funds are not settled.")
  end

  def self.apply_requires_action!(txn, pi)
    Job.transaction do
      locked = JobPaymentTransaction.lock.find(txn.id)
      next if locked.status_succeeded? || locked.status_processing?

      locked.update!(
        status: :requires_action,
        stripe_payment_intent_id: field(pi, "id"),
        investigation_required: false,
        metadata_json: locked.metadata_json.to_h.merge("client_secret" => field(pi, "client_secret"), "recovered_via" => "reconcile")
      )
      resolve_risk_event!(locked, note: "Reconciled: Stripe PaymentIntent requires_action.")
    end
    Decision.new(outcome: "resolved_requires_action", transaction: txn.reload)
  end

  def self.apply_definitive_failure!(txn, pi)
    Job.transaction do
      job = Job.lock.find(txn.job_id)
      locked = JobPaymentTransaction.lock.find(txn.id)
      next if locked.status_succeeded? || locked.status_processing?

      error = begin
        pi.last_payment_error&.message
      rescue StandardError
        nil
      end
      locked.update!(
        status: :failed,
        stripe_payment_intent_id: field(pi, "id"),
        error_message: error.presence || "PaymentIntent #{field(pi, 'status')}",
        investigation_required: false,
        metadata_json: locked.metadata_json.to_h.merge("recovered_via" => "reconcile", "stripe_status" => field(pi, "status").to_s)
      )
      payment = Payment.lock.find_by(id: locked.payment_id)
      payment&.update!(status: "failed") if payment&.status == "pending"
      if locked.initial_job_charge? && job.pending_funding?
        job.update!(funding_status: :funding_failed)
      end
      resolve_risk_event!(locked, note: "Reconciled: Stripe PaymentIntent #{field(pi, 'status')} (definitive failure).")
    end
    Decision.new(outcome: "resolved_failed", transaction: txn.reload, error: txn.reload.error_message)
  end

  # ---- Bookkeeping ----------------------------------------------------------------------------

  def self.record_lookup_failure!(txn, lookup)
    attrs = {
      investigation_required: true,
      metadata_json: txn.metadata_json.to_h.merge(
        "reconcile_lookup_failed" => true,
        "reconcile_lookup_error" => lookup.error.to_s,
        "reconcile_lookup_failed_at" => Time.current.iso8601
      )
    }
    attrs[:status] = :outcome_unknown if txn.status_pending?
    txn.update!(attrs)
    ensure_risk_event!(txn, note: "PaymentIntent lookup failed: #{lookup.error}")
  end

  def self.flag_mismatch!(txn, pi, mismatches)
    txn.update!(
      status: (txn.status_pending? ? :outcome_unknown : txn.status),
      investigation_required: true,
      metadata_json: txn.metadata_json.to_h.merge(
        "pi_mismatch" => true,
        "pi_mismatch_fields" => mismatches,
        "pi_mismatch_payment_intent_id" => field(pi, "id"),
        "pi_mismatch_at" => Time.current.iso8601,
        "requires_admin_review" => true
      )
    )
    ensure_risk_event!(txn, note: "Recovered PaymentIntent #{field(pi, 'id')} mismatches local txn: #{mismatches.join(', ')}")
  end

  def self.mark_requires_admin_review!(txn, lookup_status:)
    attrs = {
      investigation_required: true,
      metadata_json: txn.metadata_json.to_h.merge(
        "requires_admin_review" => true,
        "reconcile_lookup_status" => lookup_status,
        "requires_admin_review_at" => Time.current.iso8601
      )
    }
    attrs[:status] = :outcome_unknown if txn.status_pending?
    txn.update!(attrs)
    ensure_risk_event!(txn, note: "No PaymentIntent found after complete search; outside safe retry window. Admin review required.")
  end

  def self.admin_close_as_failed!(txn, actor:, reason:, lookup_status:)
    raise ArgumentError, "reason is required to close an unknown collection as failed" if reason.to_s.strip.blank?
    raise ArgumentError, "actor is required" if actor.blank?

    Job.transaction do
      job = Job.lock.find(txn.job_id)
      locked = JobPaymentTransaction.lock.find(txn.id)
      next if locked.status_succeeded? || locked.status_processing?

      locked.update!(
        status: :failed,
        error_message: "Admin closed after complete not-found search outside safe window",
        investigation_required: false,
        metadata_json: locked.metadata_json.to_h.merge(
          "requires_admin_review" => false,
          "admin_closed_as_failed" => {
            "actor_user_id" => actor.id,
            "actor_email" => actor.try(:email).to_s,
            "reason" => reason.to_s,
            "lookup_status" => lookup_status,
            "at" => Time.current.iso8601
          }
        )
      )
      payment = Payment.lock.find_by(id: locked.payment_id)
      payment&.update!(status: "failed") if payment&.status == "pending"
      if locked.initial_job_charge? && job.pending_funding?
        job.update!(funding_status: :funding_failed)
      end
      resolve_risk_event!(locked, note: "Admin #{actor.try(:email)} closed as failed: #{reason}", resolved_by: actor.try(:email).to_s)
    end
    Decision.new(outcome: "resolved_failed", transaction: txn.reload, message: "Closed as definitive failure by admin.")
  end

  def self.note!(txn, key, **data)
    txn.update!(metadata_json: txn.metadata_json.to_h.merge("reconcile_#{key}" => data.merge("at" => Time.current.iso8601).stringify_keys))
  end

  def self.ensure_risk_event!(txn, note:)
    key = correlation_key_for(txn)
    existing = PaymentRiskEvent.find_by(correlation_key: key)
    if existing
      if existing.investigation_status == "resolved"
        existing.update!(investigation_status: "open", investigation_required: true, reopened_at: Time.current, admin_note: note)
      else
        existing.update!(admin_note: note)
      end
      return existing
    end

    PaymentRiskEvent.record!(
      job: txn.job,
      risk_kind: RISK_KIND,
      amount_cents: txn.amount_cents,
      job_payment_transaction: txn,
      stripe_payment_intent_id: txn.stripe_payment_intent_id,
      correlation_key: key,
      lifecycle_state: "outcome_unknown",
      admin_note: note,
      metadata: { "transaction_type" => txn.transaction_type, "revision" => txn.revision }
    )
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
    PaymentRiskEvent.find_by(correlation_key: key)
  end

  def self.resolve_risk_event!(txn, note:, resolved_by: "system:reconcile")
    event = PaymentRiskEvent.find_by(correlation_key: correlation_key_for(txn))
    return unless event
    return if event.investigation_status == "resolved"

    event.update!(
      investigation_status: "resolved",
      investigation_required: false,
      lifecycle_state: "admin_resolved",
      resolved_at: Time.current,
      resolved_by: resolved_by,
      admin_note: note
    )
  end

  def self.collection?(txn)
    JobPaymentTransaction::COLLECTION_TYPES.include?(txn.transaction_type.to_s)
  end

  def self.stripe_metadata(pi)
    raw = field_raw(pi, "metadata")
    return {} if raw.nil?

    hash = raw.respond_to?(:to_h) ? raw.to_h : {}
    hash.transform_keys(&:to_s).transform_values(&:to_s)
  rescue StandardError
    {}
  end

  def self.field(obj, key)
    JobStripeOps.stripe_obj_field(obj, key)
  end

  def self.field_raw(obj, key)
    return obj[key] || obj[key.to_sym] if obj.is_a?(Hash)
    return obj.public_send(key) if obj.respond_to?(key)

    obj[key]
  rescue StandardError
    nil
  end
end
