# frozen_string_literal: true

class PaymentService
  RELEASE_HOURS = 72

  class PaymentError < StandardError; end

  # Charge company when they accept the tech (job -> filled)
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
