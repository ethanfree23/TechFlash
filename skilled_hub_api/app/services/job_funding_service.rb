# frozen_string_literal: true

class JobFundingService
  class Error < StandardError; end

  def self.ensure_header!(job)
    payment = job.payments.order(:id).first
    return payment if payment

    job.payments.create!(
      amount_cents: [job.tech_payout_cents, job.job_amount_cents, 0].max,
      status: "pending",
      transfer_group: job.transfer_group,
      currency: "usd"
    )
  end

  def self.snapshot_company!(job)
    profile = job.company_profile
    pct = MembershipPolicy.company_commission_percent(profile)
    tier = MembershipTierConfig.find_by(audience: "company", slug: profile&.membership_level)
    labor = job.job_amount_cents
    job.assign_attributes(
      company_commission_percent_snapshot: pct,
      company_membership_tier_config_id: tier&.id,
      agreed_hourly_rate_cents: job.hourly_rate_cents,
      estimated_hours: JobMoney.estimated_hours(job.hours_per_day, job.days),
      agreed_labor_cents: labor
    )
    job
  end

  def self.snapshot_technician!(job, technician_profile)
    pct = MembershipPolicy.technician_commission_percent(technician_profile)
    tier = MembershipTierConfig.find_by(audience: "technician", slug: technician_profile&.membership_level)
    job.update!(
      technician_commission_percent_snapshot: pct,
      technician_membership_tier_config_id: tier&.id
    )
  end

  def self.clear_technician_snapshot!(job)
    job.update!(
      technician_commission_percent_snapshot: nil,
      technician_membership_tier_config_id: nil
    )
  end

  def self.record_revision!(job, source:, transaction: nil)
    JobFinancialRevision.create!(
      job: job,
      revision_number: job.financial_revision,
      source: source,
      hourly_rate_cents: job.agreed_hourly_rate_cents,
      estimated_hours: job.estimated_hours,
      labor_cents: job.agreed_labor_cents.to_i,
      company_required_cents: JobMoney.company_charge_cents(job.agreed_labor_cents.to_i, job.company_commission_percent),
      technician_payout_cents: JobMoney.technician_payout_cents(job.agreed_labor_cents.to_i, job.technician_commission_percent),
      company_commission_percent: job.company_commission_percent_snapshot,
      technician_commission_percent: job.technician_commission_percent_snapshot,
      job_payment_transaction: transaction
    )
  rescue ActiveRecord::RecordNotUnique
    JobFinancialRevision.find_by!(job: job, revision_number: job.financial_revision)
  end

  def self.fund_for_publish!(job)
    snapshot_company!(job)
    job.financial_revision = 1 if job.financial_revision.to_i < 1
    job.save!

    if !job.priced? || job.billing_exempt?
      job.update!(status: :open, funding_status: :funded, go_live_at: Time.current)
      record_revision!(job, source: "posting")
      return { success: true, job: job, waived: true }
    end

    charge = collect!(
      job: job,
      amount_cents: JobMoney.company_charge_cents(job.agreed_labor_cents.to_i, job.company_commission_percent),
      transaction_type: :initial_job_charge,
      revision: job.financial_revision
    )
    if charge[:success]
      publish!(job)
      record_revision!(job, source: "posting", transaction: charge[:transaction])
      MailDelivery.safe_deliver { UserMailer.payment_confirmation_email(job, charge[:transaction].amount_cents).deliver_now }
      { success: true, job: job, transaction: charge[:transaction] }
    elsif charge[:requires_action]
      job.update!(status: :pending_funding, funding_status: :adjustment_required)
      { success: false, requires_action: true, client_secret: charge[:client_secret], job: job, transaction: charge[:transaction] }
    else
      job.update!(status: :pending_funding, funding_status: :funding_failed)
      { success: false, error: charge[:error], job: job }
    end
  end

  def self.confirm_requires_action!(job)
    txn = job.job_payment_transactions.where(status: :requires_action).order(:id).last
    return { error: "No payment requiring confirmation" } if txn.blank?
    return { error: "Stripe not configured" } if Stripe.api_key.blank? && !(defined?(DemoMode) && DemoMode.enabled?)

    if defined?(DemoMode) && DemoMode.enabled?
      mark_txn_succeeded!(txn)
      publish!(job)
      return { success: true, job: job }
    end

    intent = Stripe::PaymentIntent.retrieve(txn.stripe_payment_intent_id)
    if intent.status == "succeeded"
      mark_txn_succeeded!(txn, charge_id: intent.latest_charge.to_s.presence)
      if txn.initial_job_charge?
        publish!(job)
        record_revision!(job, source: "posting", transaction: txn)
        MailDelivery.safe_deliver { UserMailer.payment_confirmation_email(job, txn.amount_cents).deliver_now }
      elsif txn.counteroffer_top_up? || txn.final_hours_top_up?
        JobFundingAdjustmentService.after_successful_collection!(job)
      end
      { success: true, job: job.reload }
    else
      { error: "Payment is not complete (#{intent.status})", requires_action: intent.status == "requires_action", client_secret: intent.client_secret }
    end
  end

  def self.collect!(job:, amount_cents:, transaction_type:, revision:)
    amount = amount_cents.to_i
    return { success: true } if amount <= 0

    payment = ensure_header!(job)
    key = "tf_job_#{job.id}_txn_#{transaction_type}_r#{revision}_#{amount}"
    existing = JobPaymentTransaction.find_by(idempotency_key: key)
    if existing&.status_succeeded?
      return { success: true, transaction: existing }
    end
    if existing&.status_requires_action?
      return { success: false, requires_action: true, client_secret: existing.metadata_json.to_h["client_secret"], transaction: existing }
    end

    user = job.company_profile.user
    skip_live_customer = JobStripeOps.demo? || Rails.env.test?
    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user) unless skip_live_customer
    return { error: "Company must add a payment method in Settings before posting a job" } if customer_id.blank? && !skip_live_customer

    pm_id = default_payment_method_id(customer_id) unless skip_live_customer
    return { error: "Company has no payment method on file. Add a card in Settings." } if pm_id.blank? && !skip_live_customer

    txn = existing || JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: transaction_type,
      direction: :inbound,
      amount_cents: amount,
      currency: "usd",
      status: :pending,
      idempotency_key: key,
      revision: revision,
      metadata_json: {}
    )

    result = JobStripeOps.create_payment_intent!(
      amount_cents: amount,
      customer_id: customer_id,
      payment_method_id: pm_id,
      metadata: stripe_metadata(job, txn),
      transfer_group: job.transfer_group,
      idempotency_key: key
    )

    if result.succeeded?
      mark_txn_succeeded!(txn, stripe_id: result.stripe_id, charge_id: result.charge_id)
      payment.update!(status: "held", stripe_payment_intent_id: result.stripe_id, held_at: Time.current) if payment.stripe_payment_intent_id.blank?
      { success: true, transaction: txn.reload }
    elsif result.requires_action?
      txn.update!(
        status: :requires_action,
        stripe_payment_intent_id: result.stripe_id,
        metadata_json: txn.metadata_json.to_h.merge("client_secret" => result.client_secret)
      )
      { success: false, requires_action: true, client_secret: result.client_secret, transaction: txn }
    else
      txn.update!(status: :failed, error_message: result.error, stripe_payment_intent_id: result.stripe_id)
      payment.update!(status: "failed") if payment.status == "pending"
      { error: result.error || "Payment failed", transaction: txn }
    end
  end

  def self.refund_delta!(job:, amount_cents:, transaction_type:, revision:)
    amount = amount_cents.to_i
    return { success: true } if amount <= 0

    payment = ensure_header!(job)
    key = "tf_job_#{job.id}_txn_#{transaction_type}_r#{revision}_#{amount}"
    existing = JobPaymentTransaction.find_by(idempotency_key: key)
    return { success: true, transaction: existing } if existing&.status_succeeded?

    source_pi = refundable_payment_intent_id(job)
    return { error: "No collected payment available to refund" } if source_pi.blank? && !(defined?(DemoMode) && DemoMode.enabled?)

    txn = existing || JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: transaction_type,
      direction: :outbound,
      amount_cents: amount,
      currency: "usd",
      status: :pending,
      idempotency_key: key,
      revision: revision,
      metadata_json: {}
    )

    result = JobStripeOps.refund!(
      amount_cents: amount,
      payment_intent_id: source_pi || "pi_demo",
      metadata: stripe_metadata(job, txn),
      idempotency_key: key
    )
    if result.succeeded?
      txn.update!(status: :succeeded, stripe_refund_id: result.stripe_id, stripe_payment_intent_id: source_pi, succeeded_at: Time.current)
      { success: true, transaction: txn.reload }
    else
      txn.update!(status: :failed, error_message: result.error)
      { error: result.error || "Refund failed", transaction: txn }
    end
  end

  def self.publish!(job)
    job.update!(status: :open, funding_status: :funded, go_live_at: job.go_live_at.presence || Time.current)
  end

  def self.mark_txn_succeeded!(txn, stripe_id: nil, charge_id: nil)
    attrs = { status: :succeeded, succeeded_at: Time.current }
    attrs[:stripe_payment_intent_id] = stripe_id if stripe_id.present?
    attrs[:stripe_charge_id] = charge_id if charge_id.present?
    txn.update!(attrs)
  end

  def self.stripe_metadata(job, txn)
    {
      job_id: job.id.to_s,
      payment_id: txn.payment_id.to_s,
      transaction_id: txn.id.to_s,
      transaction_type: txn.transaction_type,
      revision: txn.revision.to_s
    }
  end

  def self.default_payment_method_id(customer_id)
    return nil if customer_id.blank?

    customer = Stripe::Customer.retrieve(customer_id, expand: ["invoice_settings.default_payment_method"])
    pm_id = customer.invoice_settings&.default_payment_method
    pm_id = pm_id.id if pm_id.respond_to?(:id)
    pm_id ||= Stripe::PaymentMethod.list(customer: customer_id, type: "card").data.first&.id
    pm_id
  rescue Stripe::StripeError
    nil
  end

  def self.refundable_payment_intent_id(job)
    job.job_payment_transactions.status_succeeded.company_collections.order(:id).filter_map(&:stripe_payment_intent_id).reverse.find(&:present?)
  end
end
