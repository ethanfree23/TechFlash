# frozen_string_literal: true

# Admin-only, one-shot, isolated $5 ACH production smoke test.
#
# Lifecycle: authorize! (record the owner's single-use authorization; no Stripe write)
#         → execute!(live_execute: true) (exactly one PaymentIntent create under a stable key)
#         → webhooks / reconcile! update the row from Stripe's authoritative state.
#
# Guarantees:
#   * No Job, Payment, JobPaymentTransaction, JobLedger, transfer_group, or technician is ever
#     created or referenced. Stripe metadata marks the intent as an internal smoke test so the
#     job-funding webhook handlers refuse it.
#   * One debit per authorization: any row that has already started a Stripe create is refused
#     unless reconciliation proves (complete search) that no PaymentIntent exists AND the first
#     attempt is inside the same-key safe window — in which case the SAME key is replayed.
#   * Never retries with a new key, never schedules, never refunds, never transfers.
class InternalFinancialSmokeTestService
  class Error < StandardError; end
  class PreconditionError < Error; end

  SAFE_RETRY_WINDOW = CollectionOutcomeReconciler::SAFE_RETRY_WINDOW
  COMPANY_ENV_KEY = "INTERNAL_SMOKE_TEST_COMPANY_PROFILE_ID"

  Outcome = Struct.new(:status, :smoke_test, :message, :dry_run, :payment_intent_id, keyword_init: true)

  class << self
    # ---- Authorization (no Stripe write) ------------------------------------------------------

    def authorize!(company_profile_id:, operator:, authorization_reference:, authorized_at:, reason:,
                   amount_cents:, payment_method_id:, customer_id: nil)
      operator = operator.is_a?(User) ? operator : User.find_by(email: operator.to_s)
      raise PreconditionError, "operator must be an existing admin user" unless operator&.admin?

      company = CompanyProfile.find_by(id: company_profile_id)
      raise PreconditionError, "company profile #{company_profile_id} not found" unless company
      assert_authorized_payer!(company)

      amount = Integer(amount_cents)
      if amount <= 0 || amount > InternalFinancialSmokeTest::MAX_AMOUNT_CENTS
        raise PreconditionError, "amount_cents must be between 1 and #{InternalFinancialSmokeTest::MAX_AMOUNT_CENTS}"
      end
      raise PreconditionError, "authorization_reference is required" if authorization_reference.to_s.strip.blank?
      raise PreconditionError, "reason is required" if reason.to_s.strip.blank?
      raise PreconditionError, "payment_method_id must be an explicitly selected pm_… id" unless payment_method_id.to_s.start_with?("pm_")

      authorized_time = authorized_at.is_a?(String) ? Time.zone.parse(authorized_at) : authorized_at
      raise PreconditionError, "authorized_at must be a valid timestamp" if authorized_time.blank?
      raise PreconditionError, "authorized_at cannot be in the future" if authorized_time > 5.minutes.from_now

      customer = customer_id.presence || company.user&.stripe_customer_id
      raise PreconditionError, "company has no Stripe customer on file" if customer.blank?

      if InternalFinancialSmokeTest.exists?(authorization_reference: authorization_reference.to_s.strip)
        raise PreconditionError, "authorization_reference already used; each authorization is single-use"
      end

      test = InternalFinancialSmokeTest.create!(
        company_profile: company,
        operator_user: operator,
        operator_email: operator.email,
        authorization_reference: authorization_reference.to_s.strip,
        authorized_at: authorized_time,
        authorization_reason: reason.to_s.strip,
        amount_cents: amount,
        currency: InternalFinancialSmokeTest::CURRENCY,
        stripe_customer_id: customer,
        stripe_payment_method_id: payment_method_id.to_s,
        status: "authorized",
        reconciliation_status: "none"
      )
      test.append_history!("authorized", operator_user_id: operator.id, operator_email: operator.email)
      test
    end

    # ---- Execution (the single Stripe write) --------------------------------------------------

    # live_execute must be explicitly true; everything else is a dry run that performs every
    # server-side check and returns what would happen without touching Stripe.
    def execute!(smoke_test, operator:, live_execute: false)
      test = InternalFinancialSmokeTest.find(smoke_test.id)
      operator = operator.is_a?(User) ? operator : User.find_by(email: operator.to_s)
      raise PreconditionError, "operator must be an existing admin user" unless operator&.admin?

      check_preconditions!(test)

      # One debit per authorization. Rows that already touched Stripe are refused here; the only
      # path back is reconcile!, which may re-enable a SAME-key replay inside the safe window.
      if test.attempted? && !same_key_replay_allowed?(test)
        raise PreconditionError,
              "smoke test #{test.public_id} already attempted (status=#{test.status}); refusing a second debit. " \
              "Run reconcile first; a new key is never issued."
      end

      pm = verify_payment_method_ownership!(test)

      params = {
        amount: test.amount_cents,
        currency: test.currency,
        customer: test.stripe_customer_id,
        payment_method: test.stripe_payment_method_id,
        payment_method_types: ["us_bank_account"],
        confirm: true,
        off_session: true,
        description: "TechFlash INTERNAL financial smoke test #{test.public_id} (not a job payment)",
        metadata: test.stripe_metadata
      }

      unless live_execute == true
        test.append_history!("dry_run", operator_user_id: operator.id, would_use_idempotency_key: test.idempotency_key)
        return Outcome.new(status: "dry_run", smoke_test: test, dry_run: true,
                           message: "DRY RUN: all preconditions passed. Set LIVE_EXECUTE=1 to debit #{test.amount_cents} #{test.currency.upcase} " \
                                    "from #{pm_label(pm)} under idempotency key #{test.idempotency_key}.")
      end

      # Stamp before the call so a crash/timeout can never lose the fact that Stripe may have
      # been reached. From here on this row counts as attempted.
      test.update!(
        first_attempted_at: test.first_attempted_at || Time.current,
        last_attempted_at: Time.current,
        status: (test.status == "authorized" ? "outcome_unknown" : test.status),
        reconciliation_status: "pending_reconciliation",
        livemode: Stripe.api_key.to_s.start_with?("sk_live_")
      )
      test.append_history!("execute_started", operator_user_id: operator.id, idempotency_key: test.idempotency_key)

      result = create_payment_intent(params, idempotency_key: test.idempotency_key)
      apply_create_result!(test, result)
    end

    # ---- Reconciliation ---------------------------------------------------------------------

    def reconcile!(smoke_test)
      test = InternalFinancialSmokeTest.find(smoke_test.id)
      return Outcome.new(status: test.status, smoke_test: test, message: "terminal; nothing to reconcile") if test.terminal? && test.reconciliation_status == "reconciled"
      return Outcome.new(status: test.status, smoke_test: test, message: "not attempted; nothing to reconcile") unless test.attempted?

      lookup = if test.stripe_payment_intent_id.present?
        JobStripeOps.retrieve_payment_intent(test.stripe_payment_intent_id)
      else
        JobStripeOps.find_payment_intent_for_attempt(
          customer_id: test.stripe_customer_id,
          metadata_key: "internal_smoke_test_id",
          metadata_value: test.public_id,
          created_after: test.first_attempted_at || test.created_at,
          extra_metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true" }
        )
      end

      if lookup.lookup_failed?
        test.update!(reconciliation_status: (within_safe_window?(test) ? "pending_reconciliation" : "requires_admin"))
        test.append_history!("reconcile_lookup_failed", error: lookup.error.to_s)
        return Outcome.new(status: test.status, smoke_test: test,
                           message: "lookup failed (#{lookup.error}); outcome still unknown, no new attempt permitted")
      end

      if lookup.found?
        pi = lookup.payment_intent
        mismatches = intent_mismatches(pi, test)
        if mismatches.any?
          test.update!(reconciliation_status: "requires_admin")
          test.append_history!("reconcile_mismatch", payment_intent_id: pi.id, fields: mismatches)
          return Outcome.new(status: test.status, smoke_test: test,
                             message: "PaymentIntent #{pi.id} does not match (#{mismatches.join(', ')}); requires admin")
        end
        apply_intent_state!(test, pi, via: "reconcile")
        return Outcome.new(status: test.reload.status, smoke_test: test, payment_intent_id: pi.id,
                           message: "reconciled from Stripe status=#{pi.status}")
      end

      # Complete search, nothing found.
      if within_safe_window?(test)
        test.update!(reconciliation_status: "pending_reconciliation")
        test.append_history!("reconcile_not_found_within_window")
        Outcome.new(status: test.status, smoke_test: test,
                    message: "no PaymentIntent found after complete search; same-key replay permitted until " \
                             "#{(test.first_attempted_at + SAFE_RETRY_WINDOW).iso8601}")
      else
        test.update!(reconciliation_status: "requires_admin")
        test.append_history!("reconcile_not_found_outside_window")
        Outcome.new(status: test.status, smoke_test: test,
                    message: "no PaymentIntent found after complete search but the safe window has lapsed; requires admin. No automatic retry.")
      end
    end

    # ---- Webhooks ---------------------------------------------------------------------------

    # Called by the signed platform webhook endpoint before any job-funding handler. Returns true
    # when the event belonged to a smoke test (and must not reach job handlers).
    def handle_webhook_event!(event)
      type = event.type.to_s
      object = event.data.object

      case type
      when "payment_intent.succeeded", "payment_intent.processing", "payment_intent.payment_failed", "payment_intent.canceled"
        test = find_for_payment_intent(object)
        return false unless test

        apply_webhook_intent!(test, object, event_id: event.id, event_type: type)
        true
      when "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
           "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"
        test = find_for_charge(charge_id: object.charge, payment_intent_id: object.payment_intent)
        return false unless test

        apply_webhook_dispute!(test, object, event_id: event.id, event_type: type)
        true
      when "charge.refunded", "refund.created", "refund.updated", "refund.failed"
        charge_id = type == "charge.refunded" ? object.id : object.charge
        pi_id = object.payment_intent
        test = find_for_charge(charge_id: charge_id, payment_intent_id: pi_id)
        return false unless test

        test.record_webhook_event!(event.id)
        test.append_history!("refund_event", event_type: type, event_id: event.id)
        true
      else
        false
      end
    end

    # ---- Monitoring summary -----------------------------------------------------------------

    def monitoring_summary
      rows = InternalFinancialSmokeTest.all
      {
        total: rows.count,
        by_status: InternalFinancialSmokeTest.group(:status).count,
        unresolved: rows.unresolved.order(:id).map do |t|
          {
            public_id: t.public_id,
            company_profile_id: t.company_profile_id,
            status: t.status,
            reconciliation_status: t.reconciliation_status,
            stripe_payment_intent_id: t.stripe_payment_intent_id,
            first_attempted_at: t.first_attempted_at,
            age_seconds: (t.first_attempted_at ? (Time.current - t.first_attempted_at).to_i : nil)
          }
        end
      }
    end

    # ---- Preconditions ----------------------------------------------------------------------

    def authorized_payer_id
      ENV[COMPANY_ENV_KEY].to_s.strip.presence&.to_i
    end

    def assert_authorized_payer!(company)
      expected = authorized_payer_id
      raise PreconditionError, "#{COMPANY_ENV_KEY} is not set; no company is authorized to run smoke tests" if expected.blank?
      unless company.id == expected
        raise PreconditionError, "company profile #{company.id} is not the authorized internal payer (#{expected})"
      end
    end

    def check_preconditions!(test)
      StripeModeGuard.check!
      company = test.company_profile
      raise PreconditionError, "company profile missing" unless company
      assert_authorized_payer!(company)
      begin
        AchAccess.assert_allowed!(company)
      rescue AchAccess::DisabledError => e
        raise PreconditionError, "ACH is not permitted (global or company flag off): #{e.message}"
      end
      raise PreconditionError, "Stripe secret key is not configured" if Stripe.api_key.blank?
      raise PreconditionError, "operator is no longer an admin" unless test.operator_user&.admin?
      true
    end

    # The saved PaymentMethod must be a verified US bank account attached to the company's
    # customer. Lookups are made with the platform key; ownership is confirmed on both objects.
    def verify_payment_method_ownership!(test)
      customer = Stripe::Customer.retrieve(test.stripe_customer_id)
      pm = Stripe::PaymentMethod.retrieve(test.stripe_payment_method_id)
      raise PreconditionError, "customer #{test.stripe_customer_id} is deleted" if customer.respond_to?(:deleted) && customer.deleted
      raise PreconditionError, "payment method is #{pm.type}, expected us_bank_account" unless pm.type.to_s == "us_bank_account"
      pm_customer = pm.customer.respond_to?(:id) ? pm.customer.id : pm.customer.to_s
      unless pm_customer.present? && pm_customer == test.stripe_customer_id
        raise PreconditionError, "payment method #{pm.id} is not attached to customer #{test.stripe_customer_id}"
      end
      company_user_customer = test.company_profile.user&.stripe_customer_id.to_s
      unless company_user_customer == test.stripe_customer_id
        raise PreconditionError, "customer #{test.stripe_customer_id} does not belong to company profile #{test.company_profile_id}"
      end
      pm
    rescue Stripe::StripeError => e
      raise PreconditionError, "could not verify Stripe ownership: #{e.class}: #{e.message}"
    end

    # ---- Internals --------------------------------------------------------------------------

    def within_safe_window?(test)
      test.first_attempted_at.present? && test.first_attempted_at > SAFE_RETRY_WINDOW.ago
    end

    # Only after reconcile! proved (complete search) nothing exists and the window still holds.
    def same_key_replay_allowed?(test)
      return false unless test.status == "outcome_unknown"
      return false if test.stripe_payment_intent_id.present?
      return false unless within_safe_window?(test)

      last = Array(test.history_json).last
      last.is_a?(Hash) && last["kind"] == "reconcile_not_found_within_window"
    end

    def create_payment_intent(params, idempotency_key:)
      intent = Stripe::PaymentIntent.create(params, idempotency_key: idempotency_key)
      JobStripeOps::Result.new(
        status: intent.status.to_s,
        stripe_id: intent.id,
        charge_id: (intent.respond_to?(:latest_charge) ? intent.latest_charge.to_s.presence : nil)
      )
    rescue Stripe::CardError => e
      JobStripeOps::Result.new(status: "failed", error: e.message, error_class: e.class.name,
                               http_status: (e.http_status.to_i if e.respond_to?(:http_status)))
    rescue Stripe::StripeError => e
      JobStripeOps.classify_payment_intent_error(e)
    rescue *JobStripeOps::NETWORK_ERROR_CLASSES => e
      JobStripeOps::Result.new(status: "outcome_unknown", error: e.message.to_s.presence || e.class.name, error_class: e.class.name)
    end

    def apply_create_result!(test, result)
      case result.status
      when "succeeded"
        test.update!(status: "succeeded", stripe_payment_intent_id: result.stripe_id, stripe_charge_id: result.charge_id,
                     succeeded_at: Time.current, reconciliation_status: "reconciled", error_message: nil)
        test.append_history!("create_succeeded", payment_intent_id: result.stripe_id)
        Outcome.new(status: "succeeded", smoke_test: test, payment_intent_id: result.stripe_id, message: "PaymentIntent succeeded")
      when "processing"
        test.update!(status: "processing", stripe_payment_intent_id: result.stripe_id, stripe_charge_id: result.charge_id,
                     processing_at: Time.current, reconciliation_status: "pending_reconciliation", error_message: nil)
        test.append_history!("create_processing", payment_intent_id: result.stripe_id)
        Outcome.new(status: "processing", smoke_test: test, payment_intent_id: result.stripe_id,
                    message: "ACH debit accepted by Stripe and processing (settles in ~4 business days). Watch webhooks.")
      when "failed"
        test.update!(status: "failed", stripe_payment_intent_id: result.stripe_id.presence, failed_at: Time.current,
                     reconciliation_status: "reconciled", error_message: result.error, error_class: result.error_class)
        test.append_history!("create_failed", error: result.error.to_s, error_class: result.error_class.to_s)
        Outcome.new(status: "failed", smoke_test: test, payment_intent_id: result.stripe_id, message: "Stripe rejected the debit: #{result.error}")
      when "outcome_unknown"
        test.update!(status: "outcome_unknown", stripe_payment_intent_id: result.stripe_id.presence,
                     reconciliation_status: "pending_reconciliation", error_message: result.error, error_class: result.error_class)
        test.append_history!("create_outcome_unknown", error: result.error.to_s, error_class: result.error_class.to_s)
        Outcome.new(status: "outcome_unknown", smoke_test: test,
                    message: "Stripe result unknown (#{result.error_class}). Do NOT re-run; use reconcile.")
      else
        # requires_action / requires_payment_method etc. for an off-session saved bank debit are
        # not expected; treat as unknown until reconciled.
        test.update!(status: "outcome_unknown", stripe_payment_intent_id: result.stripe_id.presence,
                     reconciliation_status: "pending_reconciliation", error_message: "unexpected intent status #{result.status}")
        test.append_history!("create_unexpected_status", stripe_status: result.status.to_s, payment_intent_id: result.stripe_id)
        Outcome.new(status: "outcome_unknown", smoke_test: test, payment_intent_id: result.stripe_id,
                    message: "Unexpected PaymentIntent status #{result.status}; reconcile before any further action.")
      end
    end

    def intent_mismatches(pi, test)
      m = []
      meta = (pi.metadata.respond_to?(:to_h) ? pi.metadata.to_h : {}).transform_keys(&:to_s).transform_values(&:to_s)
      m << "metadata.marker" unless meta[InternalFinancialSmokeTest::METADATA_MARKER] == "true"
      m << "metadata.internal_smoke_test_id" if meta["internal_smoke_test_id"].present? && meta["internal_smoke_test_id"] != test.public_id
      m << "metadata.company_profile_id" if meta["company_profile_id"].present? && meta["company_profile_id"] != test.company_profile_id.to_s
      amount = field(pi, "amount")
      m << "amount" if amount.present? && amount.to_i != test.amount_cents
      currency = field(pi, "currency")
      m << "currency" if currency.present? && !currency.to_s.casecmp?(test.currency)
      customer = field(pi, "customer")
      m << "customer" if customer.present? && customer.to_s != test.stripe_customer_id
      stored = test.stripe_payment_intent_id.presence
      m << "payment_intent_id" if stored && field(pi, "id").present? && stored != field(pi, "id").to_s
      m
    end

    def find_for_payment_intent(pi)
      meta = begin
        (pi.metadata.respond_to?(:to_h) ? pi.metadata.to_h : {}).transform_keys(&:to_s)
      rescue StandardError
        {}
      end
      test = InternalFinancialSmokeTest.find_by(stripe_payment_intent_id: pi.id.to_s) if pi.id.present?
      if test.nil? && meta[InternalFinancialSmokeTest::METADATA_MARKER].to_s == "true" && meta["internal_smoke_test_id"].present?
        test = InternalFinancialSmokeTest.find_by(public_id: meta["internal_smoke_test_id"].to_s)
      end
      # A PaymentIntent carrying the smoke marker must never fall through to job handlers, even
      # if no local row matches (log + swallow).
      if test.nil? && meta[InternalFinancialSmokeTest::METADATA_MARKER].to_s == "true"
        Rails.logger.warn("[smoke test] webhook for unknown internal smoke test pi=#{pi.id}; ignored")
        return :orphan
      end
      test
    end

    def find_for_charge(charge_id:, payment_intent_id:)
      charge_id = charge_id.to_s.presence
      pi_id = payment_intent_id.to_s.presence
      test = InternalFinancialSmokeTest.find_by(stripe_charge_id: charge_id) if charge_id
      test ||= InternalFinancialSmokeTest.find_by(stripe_payment_intent_id: pi_id) if pi_id
      test
    end

    def apply_webhook_intent!(test, pi, event_id:, event_type:)
      return if test == :orphan

      InternalFinancialSmokeTest.transaction do
        locked = InternalFinancialSmokeTest.lock.find(test.id)
        next unless locked.record_webhook_event!(event_id)

        mismatches = intent_mismatches(pi, locked)
        if mismatches.any?
          locked.update!(reconciliation_status: "requires_admin")
          locked.append_history!("webhook_mismatch", event_type: event_type, event_id: event_id, payment_intent_id: pi.id, fields: mismatches)
          next
        end
        apply_intent_state!(locked, pi, via: event_type, event_id: event_id)
      end
    end

    # Authoritative state transitions. Monotonic: succeeded is never downgraded by a late
    # processing/failed event; failed is never overwritten by a late processing event.
    def apply_intent_state!(test, pi, via:, event_id: nil)
      stripe_status = field(pi, "status").to_s
      pi_id = field(pi, "id").to_s.presence
      charge_id = field(pi, "latest_charge").to_s.presence
      common = { stripe_payment_intent_id: pi_id || test.stripe_payment_intent_id, stripe_charge_id: charge_id || test.stripe_charge_id }

      case stripe_status
      when "succeeded"
        unless test.status == "succeeded"
          test.update!(common.merge(status: "succeeded", succeeded_at: Time.current, reconciliation_status: "reconciled", error_message: nil))
        end
      when "processing"
        if %w[authorized outcome_unknown processing].include?(test.status)
          test.update!(common.merge(status: "processing", processing_at: test.processing_at || Time.current,
                                    reconciliation_status: "pending_reconciliation"))
        end
      when "requires_payment_method", "canceled"
        if %w[authorized outcome_unknown processing].include?(test.status)
          error = begin
            pi.last_payment_error&.message
          rescue StandardError
            nil
          end
          test.update!(common.merge(status: "failed", failed_at: Time.current, reconciliation_status: "reconciled",
                                    error_message: error.presence || "PaymentIntent #{stripe_status}"))
        end
      else
        test.update!(common) if common.values.any?(&:present?)
      end
      test.append_history!("stripe_state", via: via, event_id: event_id, stripe_status: stripe_status, payment_intent_id: pi_id,
                                           local_status: test.reload.status)
    end

    def apply_webhook_dispute!(test, dispute, event_id:, event_type:)
      InternalFinancialSmokeTest.transaction do
        locked = InternalFinancialSmokeTest.lock.find(test.id)
        next unless locked.record_webhook_event!(event_id)

        # A dispute / ACH return after success is recorded on top of the historical success.
        # No automatic refund, reversal, or further debit.
        locked.update!(
          dispute_status: dispute.status.to_s.presence || event_type,
          stripe_dispute_id: dispute.id.to_s,
          reconciliation_status: "requires_admin"
        )
        locked.append_history!("dispute", event_type: event_type, event_id: event_id, dispute_id: dispute.id.to_s,
                                          dispute_status: dispute.status.to_s, reason: dispute.try(:reason).to_s, amount: dispute.try(:amount))
      end
    end

    def pm_label(pm)
      bank = pm.respond_to?(:us_bank_account) ? pm.us_bank_account : nil
      "#{pm.id} (#{bank&.bank_name} ••••#{bank&.last4})"
    end

    def field(obj, key)
      JobStripeOps.stripe_obj_field(obj, key)
    end
  end
end
