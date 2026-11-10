# frozen_string_literal: true

class JobStripeOps
  class Result
    attr_reader :status, :stripe_id, :charge_id, :client_secret, :error, :error_class, :http_status, :simulated,
                :payment_method_id, :payment_method_type, :payment_method_last4,
                :payment_method_brand, :payment_method_bank_name

    def initialize(status:, stripe_id: nil, charge_id: nil, client_secret: nil, error: nil, error_class: nil,
                   http_status: nil, simulated: false,
                   payment_method_id: nil, payment_method_type: nil, payment_method_last4: nil,
                   payment_method_brand: nil, payment_method_bank_name: nil)
      @status = status
      @stripe_id = stripe_id
      @charge_id = charge_id
      @client_secret = client_secret
      @error = error
      @error_class = error_class
      @http_status = http_status
      @simulated = simulated
      @payment_method_id = payment_method_id
      @payment_method_type = payment_method_type
      @payment_method_last4 = payment_method_last4
      @payment_method_brand = payment_method_brand
      @payment_method_bank_name = payment_method_bank_name
    end

    def succeeded?
      status.to_s == "succeeded"
    end

    def requires_action?
      status.to_s == "requires_action"
    end

    # ACH Direct Debit: Stripe accepted the debit request; funds are not settled yet.
    def processing?
      status.to_s == "processing"
    end

    # Ambiguous Stripe outcome — do not treat as definitive failure.
    def outcome_unknown?
      status.to_s == "outcome_unknown"
    end

    def failed?
      status.to_s == "failed"
    end

    def payment_method_attrs
      {
        stripe_payment_method_id: payment_method_id,
        payment_method_type: payment_method_type,
        payment_method_last4: payment_method_last4,
        payment_method_brand: payment_method_brand,
        payment_method_bank_name: payment_method_bank_name
      }.compact
    end
  end

  def self.demo?
    defined?(DemoMode) && DemoMode.enabled?
  end

  # Simulate Stripe only in DemoMode or local/unit tests — never in staging (real sk_test_).
  def self.simulate_stripe?
    return true if demo?
    return true if Rails.env.test? && !ENV["STRIPE_INTEGRATION_TEST"].to_s.strip.casecmp("true").zero?

    false
  end

  def self.create_payment_intent!(amount_cents:, customer_id:, payment_method_id:, metadata:, transfer_group:, idempotency_key:, off_session: true)
    if simulate_stripe?
      return Result.new(
        status: "succeeded",
        stripe_id: "pi_test_#{SecureRandom.hex(8)}",
        simulated: true,
        payment_method_id: payment_method_id,
        payment_method_type: "card",
        payment_method_last4: "4242",
        payment_method_brand: "visa"
      )
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    pm_meta = payment_method_display(payment_method_id)
    params = {
      amount: amount_cents,
      currency: "usd",
      customer: customer_id,
      payment_method: payment_method_id,
      off_session: off_session,
      confirm: true,
      metadata: metadata,
      transfer_group: transfer_group
    }

    if pm_meta[:payment_method_type].to_s == "us_bank_account"
      # Explicit ACH path — do not rely on automatic_payment_methods for bank debits.
      params[:payment_method_types] = ["us_bank_account"]
    else
      params[:automatic_payment_methods] = { enabled: true, allow_redirects: "never" }
    end

    intent = Stripe::PaymentIntent.create(params, { idempotency_key: idempotency_key })
    Result.new(
      status: intent.status,
      stripe_id: intent.id,
      charge_id: intent.latest_charge.to_s.presence,
      client_secret: intent.client_secret,
      error: intent.last_payment_error&.message,
      **pm_meta
    )
  rescue Stripe::CardError => e
    Result.new(
      status: "failed",
      error: e.message,
      stripe_id: e.json_body.dig(:error, :payment_intent, :id),
      **pm_meta_safe(payment_method_id)
    )
  rescue Stripe::StripeError => e
    Result.new(status: "failed", error: e.message, **pm_meta_safe(payment_method_id))
  end

  def self.refund!(amount_cents:, payment_intent_id:, metadata:, idempotency_key:)
    if simulate_stripe?
      return Result.new(status: "succeeded", stripe_id: "re_test_#{SecureRandom.hex(8)}", simulated: true)
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    refund = Stripe::Refund.create(
      { payment_intent: payment_intent_id, amount: amount_cents, metadata: metadata },
      { idempotency_key: idempotency_key }
    )
    # Preserve Stripe's refund status vocabulary: pending stays pending (not "processing").
    Result.new(status: refund.status.to_s, stripe_id: refund.id)
  rescue Stripe::StripeError => e
    Result.new(status: "failed", error: e.message)
  end

  def self.transfer!(amount_cents:, destination:, metadata:, transfer_group:, idempotency_key:, source_transaction: nil)
    if simulate_stripe?
      return Result.new(status: "succeeded", stripe_id: "tr_test_#{SecureRandom.hex(8)}", simulated: true)
    end
    mode_error = StripeModeGuard.error_message
    return Result.new(status: "failed", error: mode_error) if mode_error
    return Result.new(status: "failed", error: "Stripe not configured") if Stripe.api_key.blank?

    params = {
      amount: amount_cents,
      currency: "usd",
      destination: destination,
      metadata: metadata,
      transfer_group: transfer_group
    }
    # source_transaction must be a Charge ID (ch_...), never a PaymentIntent ID.
    params[:source_transaction] = source_transaction if source_transaction.present?

    transfer = Stripe::Transfer.create(params, { idempotency_key: idempotency_key })
    Result.new(status: "succeeded", stripe_id: transfer.id)
  rescue Stripe::APIConnectionError, Stripe::RateLimitError => e
    classify_transfer_error(e)
  rescue Stripe::StripeError => e
    classify_transfer_error(e)
  end

  # Search platform transfers for reconciliation (separate charges and transfers).
  def self.find_transfer_for_transaction(destination:, transfer_group:, transaction_id:, job_id: nil)
    return nil if destination.blank? || Stripe.api_key.blank?
    return nil if simulate_stripe?

    list = Stripe::Transfer.list(
      {
        destination: destination,
        transfer_group: transfer_group,
        limit: 100
      }.compact
    )
    list.auto_paging_each do |tr|
      meta = tr.metadata.to_h.transform_keys(&:to_s)
      if meta["transaction_id"].to_s == transaction_id.to_s
        return tr
      end
      if job_id.present? && meta["job_id"].to_s == job_id.to_s &&
          meta["transaction_id"].to_s == transaction_id.to_s
        return tr
      end
    end
    nil
  rescue Stripe::StripeError
    nil
  end

  def self.classify_transfer_error(error)
    http = error.respond_to?(:http_status) ? error.http_status.to_i : 0
    klass = error.class.name
    msg = error.message.to_s

    ambiguous =
      error.is_a?(Stripe::APIConnectionError) ||
      error.is_a?(Stripe::RateLimitError) ||
      http >= 500 ||
      msg.match?(/timeout|timed out|connection reset|EOFError|Net::ReadTimeout|Net::OpenTimeout|temporarily unavailable/i)

    definitive =
      error.is_a?(Stripe::InvalidRequestError) ||
      error.is_a?(Stripe::AuthenticationError) ||
      error.is_a?(Stripe::PermissionError) ||
      error.is_a?(Stripe::CardError) ||
      (http >= 400 && http < 500 && !ambiguous)

    status = if ambiguous
      "outcome_unknown"
    elsif definitive
      "failed"
    else
      # Fail closed on ambiguity: never invent a definitive failure.
      "outcome_unknown"
    end

    Result.new(
      status: status,
      error: msg,
      error_class: klass,
      http_status: http
    )
  end

  def self.payment_method_display(payment_method_id)
    return {} if payment_method_id.blank?

    pm = Stripe::PaymentMethod.retrieve(payment_method_id)
    case pm.type.to_s
    when "card"
      {
        payment_method_id: pm.id,
        payment_method_type: "card",
        payment_method_last4: pm.card&.last4,
        payment_method_brand: pm.card&.brand
      }
    when "us_bank_account"
      {
        payment_method_id: pm.id,
        payment_method_type: "us_bank_account",
        payment_method_last4: pm.us_bank_account&.last4,
        payment_method_bank_name: pm.us_bank_account&.bank_name
      }
    else
      { payment_method_id: pm.id, payment_method_type: pm.type.to_s }
    end
  rescue Stripe::StripeError
    { payment_method_id: payment_method_id }
  end

  def self.pm_meta_safe(payment_method_id)
    payment_method_display(payment_method_id)
  rescue StandardError
    {}
  end
  private_class_method :pm_meta_safe
end
