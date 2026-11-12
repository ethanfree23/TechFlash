# frozen_string_literal: true

class InternalFinancialSmokeTestService
  class Error < StandardError; end

  def self.authorize!(company_profile:, actor:, amount_cents:, reason:)
    amount = amount_cents.to_i
    raise Error, "amount must be 1–#{InternalFinancialSmokeTest::MAX_AMOUNT_CENTS} cents" unless amount.between?(1, InternalFinancialSmokeTest::MAX_AMOUNT_CENTS)
    raise Error, "authorization reason is required" if reason.to_s.strip.blank?

    row = InternalFinancialSmokeTest.create!(
      company_profile: company_profile,
      authorized_by_user: actor,
      authorization_reason: reason.to_s.strip,
      amount_cents: amount,
      status: :authorized
    )
    row.append_audit!(action: "authorize", actor: actor, reason: reason, metadata: { amount_cents: amount })
    row
  end

  def self.execute_charge!(smoke_test:, actor:)
    row = smoke_test
    raise Error, "Smoke test already charged (one-shot)" if row.charge_consumed?
    raise Error, "Charge already in progress or terminal" unless row.status_authorized?

    user = row.company_profile.user
    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    raise Error, "Company has no Stripe customer" if customer_id.blank?

    pm_id = JobFundingService.default_payment_method_id(customer_id)
    raise Error, "Company has no payment method on file" if pm_id.blank?

    pm_type = JobFundingService.payment_method_type_for(pm_id)
    unless pm_type == "us_bank_account"
      raise Error, "Smoke test requires a saved US bank account payment method"
    end
    unless AchAccess.allowed?(row.company_profile)
      raise Error, AchAccess::USER_SAFE_MESSAGE
    end

    InternalFinancialSmokeTest.transaction do
      locked = InternalFinancialSmokeTest.lock.find(row.id)
      raise Error, "Smoke test already charged (one-shot)" if locked.charge_consumed?
      raise Error, "Charge not authorized" unless locked.status_authorized?

      key = "tf_smoke_#{locked.id}"
      locked.update!(
        idempotency_key: key,
        status: :pending,
        charge_initiated_at: Time.current
      )
      locked.append_audit!(action: "execute", actor: actor, reason: "ACH smoke charge", metadata: { idempotency_key: key })
    end

    row.reload
    result = JobStripeOps.create_payment_intent!(
      amount_cents: row.amount_cents,
      customer_id: customer_id,
      payment_method_id: pm_id,
      metadata: {
        techflash_smoke_test: "true",
        smoke_test_id: row.id.to_s,
        company_profile_id: row.company_profile_id.to_s
      },
      transfer_group: nil,
      idempotency_key: row.idempotency_key,
      company_profile: row.company_profile
    )

    finalize_charge!(row: row, result: result)
    row.reload
  end

  def self.refund!(smoke_test:, actor:, reason:)
    row = smoke_test
    raise Error, "authorization reason is required" if reason.to_s.strip.blank?
    raise Error, "Only succeeded smoke tests can be refunded" unless row.status_succeeded?
    raise Error, "Stripe payment intent is missing" if row.stripe_payment_intent_id.blank?
    raise Error, "Already refunded" if row.status_refunded? || row.stripe_refund_id.present?

    refund_key = "#{row.idempotency_key}_refund"
    result = JobStripeOps.refund!(
      amount_cents: row.amount_cents,
      payment_intent_id: row.stripe_payment_intent_id,
      metadata: {
        techflash_smoke_test: "true",
        smoke_test_id: row.id.to_s,
        refund_authorized_by: actor.id.to_s
      },
      idempotency_key: refund_key
    )
    unless result.succeeded? || result.status.to_s == "pending"
      raise Error, result.error || "Refund failed"
    end

    row.update!(
      status: :refunded,
      stripe_refund_id: result.stripe_id,
      refunded_at: Time.current,
      refund_authorized_by_user: actor,
      refund_authorization_reason: reason.to_s.strip
    )
    row.append_audit!(action: "refund", actor: actor, reason: reason, metadata: { stripe_refund_id: result.stripe_id })
    row
  end

  def self.finalize_charge!(row:, result:)
    InternalFinancialSmokeTest.transaction do
      locked = InternalFinancialSmokeTest.lock.find(row.id)
      return locked if locked.status_succeeded? || locked.status_refunded?

      pm_attrs = result.payment_method_attrs.transform_keys do |key|
        key == :payment_method_id ? :stripe_payment_method_id : key
      end

      if result.succeeded?
        locked.update!(
          { status: :succeeded, succeeded_at: Time.current, stripe_payment_intent_id: result.stripe_id, stripe_charge_id: result.charge_id }.merge(pm_attrs)
        )
      elsif result.processing?
        locked.update!(
          {
            status: :processing,
            processing_at: Time.current,
            stripe_payment_intent_id: result.stripe_id,
            stripe_charge_id: result.charge_id
          }.merge(pm_attrs)
        )
      elsif result.requires_action?
        locked.update!(
          {
            status: :requires_action,
            stripe_payment_intent_id: result.stripe_id,
            metadata_json: locked.metadata_json.to_h.merge("client_secret" => result.client_secret)
          }.merge(pm_attrs)
        )
      elsif result.outcome_unknown?
        locked.update!(
          {
            status: :outcome_unknown,
            error_message: result.error,
            stripe_payment_intent_id: result.stripe_id,
            investigation_required: true
          }.merge(pm_attrs)
        )
      else
        locked.update!(
          {
            status: :failed,
            error_message: result.error,
            stripe_payment_intent_id: result.stripe_id
          }.merge(pm_attrs)
        )
      end
      locked.reload
    end
  end
  private_class_method :finalize_charge!
end
