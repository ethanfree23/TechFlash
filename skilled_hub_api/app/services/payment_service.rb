# frozen_string_literal: true

class PaymentService
  RELEASE_HOURS = 72

  class PaymentError < StandardError; end

  # Check if company has a valid card on file (for posting jobs)
  def self.company_has_payment_method?(user)
    return false if user.blank?
    return false if Stripe.api_key.blank?

    customer_id = StripeCustomerService.validate_or_clear_customer_id!(user)
    return false if customer_id.blank?

    customer = Stripe::Customer.retrieve(customer_id, expand: ['invoice_settings.default_payment_method'])
    pm_id = customer.invoice_settings&.default_payment_method
    pm_id ||= Stripe::PaymentMethod.list(customer: customer_id, type: 'card').data.first&.id
    pm_id.present?
  rescue Stripe::StripeError
    false
  end

  # Charge company when tech claims a paid job (off-session, using saved card)
  def self.charge_company_on_claim(job)
    return { error: 'Job has no price' } if job.job_amount_cents.blank? || job.job_amount_cents <= 0
    return { error: 'Job already has a payment' } if job.payments.held.any? || job.payments.released.any?

    company_user = job.company_profile.user
    stripe_customer_id = StripeCustomerService.validate_or_clear_customer_id!(company_user)
    return { error: 'Company must add a payment method in Settings before technicians can claim this job' } if stripe_customer_id.blank?

    payment = job.payments.create!(
      amount_cents: job.tech_payout_cents,
      status: 'pending'
    )

    begin
      return { error: 'Stripe not configured' } if Stripe.api_key.blank?

      # Get customer's default payment method or first available
      customer = Stripe::Customer.retrieve(stripe_customer_id, expand: ['invoice_settings.default_payment_method'])
      pm_id = customer.invoice_settings&.default_payment_method
      pm_id ||= Stripe::PaymentMethod.list(customer: stripe_customer_id, type: 'card').data.first&.id
      return { error: 'Company has no payment method on file. Ask them to add a card in Settings.' } if pm_id.blank?

      intent = Stripe::PaymentIntent.create(
        amount: job.company_charge_cents,
        currency: 'usd',
        customer: stripe_customer_id,
        payment_method: pm_id,
        off_session: true,
        confirm: true,
        metadata: { job_id: job.id.to_s, payment_id: payment.id.to_s },
        automatic_payment_methods: { enabled: true }
      )

      if intent.status == 'succeeded'
        payment.update!(
          status: 'held',
          stripe_payment_intent_id: intent.id,
          held_at: Time.current
        )
        { success: true, payment: payment }
      elsif intent.status == 'requires_action'
        payment.update!(status: 'failed')
        { error: 'Payment requires authentication. Company should use a different card in Settings.' }
      else
        payment.update!(status: 'failed')
        { error: intent.last_payment_error&.message || 'Payment failed' }
      end
    rescue Stripe::StripeError => e
      payment.update!(status: 'failed') if payment.persisted?
      { error: e.message }
    end
  end

  # Refund payment when company denies the claimed tech
  def self.refund_payment(job)
    payment = job.payments.held.first
    return { error: 'No held payment to refund' } unless payment
    return { error: 'No Stripe payment to refund' } if payment.stripe_payment_intent_id.blank?

    return { error: 'Stripe not configured' } if Stripe.api_key.blank?

    begin
      Stripe::Refund.create(payment_intent: payment.stripe_payment_intent_id)
      payment.update!(status: 'refunded')
      { success: true }
    rescue Stripe::StripeError => e
      { error: e.message }
    end
  end

  # Charge company when they accept the tech (job -> filled) - legacy, kept for reference
  def self.charge_and_hold(job:, payment_method_id:)
    return { error: 'Job has no price' } if job.price_cents.blank? || job.price_cents <= 0
    return { error: 'Job already has a payment' } if job.payments.held.any? || job.payments.released.any?

    company_user = job.company_profile.user
    stripe_customer_id = company_user.stripe_customer_id
    return { error: 'Company has no payment method on file' } if payment_method_id.blank? && stripe_customer_id.blank?

    payment = job.payments.create!(
      amount_cents: job.price_cents,
      status: 'pending'
    )

    begin
      return { error: 'Stripe not configured' } if Stripe.api_key.blank?

      # Create or retrieve customer
      customer_id = stripe_customer_id
      unless customer_id
        customer = Stripe::Customer.create(
          email: company_user.email,
          payment_method: payment_method_id,
          invoice_settings: { default_payment_method: payment_method_id }
        )
        customer_id = customer.id
        company_user.update!(stripe_customer_id: customer_id)
      end

      # Create PaymentIntent and capture immediately (charge company)
      intent_params = {
        amount: job.price_cents,
        currency: 'usd',
        customer: customer_id,
        metadata: { job_id: job.id.to_s, payment_id: payment.id.to_s },
        confirm: true,
        automatic_payment_methods: { enabled: true }
      }
      intent_params[:payment_method] = payment_method_id if payment_method_id.present?

      intent = Stripe::PaymentIntent.create(intent_params)

      if intent.status == 'succeeded'
        payment.update!(
          status: 'held',
          stripe_payment_intent_id: intent.id,
          held_at: Time.current
        )
        { success: true, payment: payment }
      elsif intent.status == 'requires_action'
        { success: false, requires_action: true, client_secret: intent.client_secret }
      else
        payment.update!(status: 'failed')
        { error: intent.last_payment_error&.message || 'Payment failed' }
      end
    rescue Stripe::StripeError => e
      payment.update!(status: 'failed') if payment.persisted?
      { error: e.message }
    end
  end

  # Sum of Stripe transfers to a technician's connected account (source of truth for earnings)
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

  # Release funds to tech when: both reviewed OR 72 hours passed since job finished
  def self.release_if_eligible(job)
    return unless job.finished?
    return unless job.finished_at.present?

    payment = job.payments.held.first
    return unless payment

    return unless release_eligible?(job)

    release_to_technician(payment)
  end

  def self.release_eligible?(job)
    return false unless job.finished? && job.finished_at.present?

    # Condition 1: 72 hours (3 days) have passed
    return true if job.finished_at <= RELEASE_HOURS.hours.ago

    # Condition 2: Both parties have left a review
    company_profile = job.company_profile
    accepted_app = job.job_applications.find_by(status: :accepted)
    technician_profile = accepted_app&.technician_profile
    return false unless technician_profile

    company_reviewed = Rating.exists?(job: job, reviewer: company_profile)
    tech_reviewed = Rating.exists?(job: job, reviewer: technician_profile)
    company_reviewed && tech_reviewed
  end

  def self.release_to_technician(payment)
    job = payment.job
    accepted_app = job.job_applications.find_by(status: :accepted)
    technician_profile = accepted_app&.technician_profile
    return { error: 'No technician to pay' } unless technician_profile
    return { error: 'Technician has no Stripe account' } if technician_profile.stripe_account_id.blank?

    return { error: 'Stripe not configured' } if Stripe.api_key.blank?

    begin
      # Transfer from platform balance to connected account
      transfer = Stripe::Transfer.create(
        amount: payment.amount_cents,
        currency: 'usd',
        destination: technician_profile.stripe_account_id,
        metadata: { job_id: job.id.to_s, payment_id: payment.id.to_s }
      )

      payment.update!(
        status: 'released',
        stripe_transfer_id: transfer.id,
        released_at: Time.current
      )
      UserMailer.payment_received_email(job, payment.amount_cents).deliver_later
      { success: true, payment: payment }
    rescue Stripe::StripeError => e
      { error: e.message }
    end
  end
end
