# frozen_string_literal: true

class JobStripeOps
  class Result
    attr_reader :status, :stripe_id, :charge_id, :client_secret, :error, :simulated

    def initialize(status:, stripe_id: nil, charge_id: nil, client_secret: nil, error: nil, simulated: false)
      @status = status
      @stripe_id = stripe_id
      @charge_id = charge_id
      @client_secret = client_secret
      @error = error
      @simulated = simulated
    end

    def succeeded?
      status.to_s == "succeeded"
    end

    def requires_action?
      status.to_s == "requires_action"
    end
  end

  def self.demo?
    defined?(DemoMode) && DemoMode.enabled?
  end

    def self.create_payment_intent!(amount_cents:, customer_id:, payment_method_id:, metadata:, transfer_group:, idempotency_key:, off_session: true)
    if demo? || Rails.env.test?
      return Result.new(status: "succeeded", stripe_id: "pi_test_#{SecureRandom.hex(8)}", simulated: true)
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    params = {
      amount: amount_cents,
      currency: "usd",
      customer: customer_id,
      payment_method: payment_method_id,
      off_session: off_session,
      confirm: true,
      metadata: metadata,
      transfer_group: transfer_group,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" }
    }
    intent = Stripe::PaymentIntent.create(params, { idempotency_key: idempotency_key })
    Result.new(
      status: intent.status,
      stripe_id: intent.id,
      charge_id: intent.latest_charge.to_s.presence,
      client_secret: intent.client_secret,
      error: intent.last_payment_error&.message
    )
  rescue Stripe::CardError => e
    Result.new(status: "failed", error: e.message, stripe_id: e.json_body.dig(:error, :payment_intent, :id))
  rescue Stripe::StripeError => e
    Result.new(status: "failed", error: e.message)
  end

    def self.refund!(amount_cents:, payment_intent_id:, metadata:, idempotency_key:)
    if demo? || Rails.env.test?
      return Result.new(status: "succeeded", stripe_id: "re_test_#{SecureRandom.hex(8)}", simulated: true)
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    refund = Stripe::Refund.create(
      { payment_intent: payment_intent_id, amount: amount_cents, metadata: metadata },
      { idempotency_key: idempotency_key }
    )
    Result.new(status: refund.status == "succeeded" ? "succeeded" : refund.status, stripe_id: refund.id)
  rescue Stripe::StripeError => e
    Result.new(status: "failed", error: e.message)
  end

    def self.transfer!(amount_cents:, destination:, metadata:, transfer_group:, idempotency_key:)
    if demo? || Rails.env.test?
      return Result.new(status: "succeeded", stripe_id: "tr_test_#{SecureRandom.hex(8)}", simulated: true)
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    transfer = Stripe::Transfer.create(
      {
        amount: amount_cents,
        currency: "usd",
        destination: destination,
        metadata: metadata,
        transfer_group: transfer_group
      },
      { idempotency_key: idempotency_key }
    )
    Result.new(status: "succeeded", stripe_id: transfer.id)
  rescue Stripe::StripeError => e
    Result.new(status: "failed", error: e.message)
  end
end
