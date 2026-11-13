# frozen_string_literal: true

class JobStripeOps
  NETWORK_ERROR_CLASSES = [
    Timeout::Error,
    Errno::ECONNRESET,
    Errno::ECONNREFUSED,
    Errno::ETIMEDOUT,
    Errno::EPIPE,
    EOFError,
    SocketError,
    OpenSSL::SSL::SSLError
  ].freeze

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

  def self.create_payment_intent!(amount_cents:, customer_id:, payment_method_id:, metadata:, transfer_group:, idempotency_key:, off_session: true, company_profile: nil)
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
    if pm_meta[:payment_method_type].to_s == "us_bank_account"
      begin
        AchAccess.assert_allowed!(company_profile)
      rescue AchAccess::DisabledError => e
        return Result.new(status: "failed", error: e.message, error_class: "AchAccess::DisabledError")
      end
    end

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
    # Authoritative decline: Stripe evaluated the request and rejected it.
    Result.new(
      status: "failed",
      error: e.message,
      error_class: e.class.name,
      http_status: (e.http_status.to_i if e.respond_to?(:http_status)),
      stripe_id: card_error_payment_intent_id(e),
      **pm_meta_safe(payment_method_id)
    )
  rescue Stripe::StripeError => e
    classify_payment_intent_error(e, payment_method_id: payment_method_id)
  rescue *NETWORK_ERROR_CLASSES => e
    # Transport-level failure that escaped the Stripe client wrapper: the request may have reached Stripe.
    Result.new(
      status: "outcome_unknown",
      error: e.message.to_s.presence || e.class.name,
      error_class: e.class.name,
      **pm_meta_safe(payment_method_id)
    )
  end

  # PaymentIntent create/confirm error classification.
  #
  # DEFINITIVE FAILURE ("failed"): Stripe authoritatively rejected the request; this attempt
  # cannot have produced a debit (4xx validation/auth/permission/card errors).
  #
  # OUTCOME UNKNOWN ("outcome_unknown"): the request may have reached Stripe and a PaymentIntent
  # may exist — timeouts, connection interruptions, rate limiting, 5xx, and idempotency-key
  # conflicts (which prove a prior attempt with this key already reached Stripe). Anything that
  # cannot be classified is treated as unknown; a definitive failure is never invented.
  def self.classify_payment_intent_error(error, payment_method_id: nil)
    http = error.respond_to?(:http_status) ? error.http_status.to_i : 0
    msg = error.message.to_s
    code = error.respond_to?(:code) ? error.code.to_s : ""

    ambiguous =
      error.is_a?(Stripe::APIConnectionError) ||
      error.is_a?(Stripe::RateLimitError) ||
      error.is_a?(Stripe::IdempotencyError) ||
      code == "idempotency_error" ||
      http >= 500 ||
      msg.match?(/timeout|timed out|connection reset|EOFError|Net::ReadTimeout|Net::OpenTimeout|temporarily unavailable/i)

    definitive =
      !ambiguous && (
        error.is_a?(Stripe::InvalidRequestError) ||
        error.is_a?(Stripe::AuthenticationError) ||
        error.is_a?(Stripe::PermissionError) ||
        error.is_a?(Stripe::CardError) ||
        (http >= 400 && http < 500)
      )

    Result.new(
      status: definitive ? "failed" : "outcome_unknown",
      error: msg,
      error_class: error.class.name,
      http_status: http,
      **pm_meta_safe(payment_method_id)
    )
  end

  def self.card_error_payment_intent_id(error)
    body = error.respond_to?(:json_body) ? error.json_body : nil
    return nil unless body.respond_to?(:dig)

    body.dig(:error, :payment_intent, :id) || body.dig("error", "payment_intent", "id")
  rescue StandardError
    nil
  end
  private_class_method :card_error_payment_intent_id

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
      metadata: metadata
    }

    # String group already on the source charge/PI, or :unknown when lookup failed.
    inherited_group = nil
    if source_transaction.present?
      # source_transaction must be a Charge ID (ch_… or ACH py_…), never a PaymentIntent (pi_…).
      unless StripeChargeId.valid_shape?(source_transaction)
        return Result.new(
          status: "failed",
          error: "source_transaction must be a Charge ID (ch_… or py_…), got #{source_transaction.to_s[0, 12].inspect}"
        )
      end
      params[:source_transaction] = source_transaction

      # Stripe invalid_request: "You cannot use transfer_group if the source_transaction
      # already has one set." When the charge/PI has a group, omit the request param —
      # the Transfer inherits it. Risk A recovery still validates / lists by that group.
      inherited_group = transfer_group_on_source_charge(source_transaction)
      source_already_grouped = inherited_group == :unknown || inherited_group.present?
      if !source_already_grouped && transfer_group.present?
        params[:transfer_group] = transfer_group
      end
    elsif transfer_group.present?
      params[:transfer_group] = transfer_group
    end

    transfer = Stripe::Transfer.create(params, { idempotency_key: idempotency_key })

    # Validate returned/inherited transfer_group (do not require it as a create param).
    expected_group =
      if inherited_group.is_a?(String) && inherited_group.present?
        inherited_group
      else
        transfer_group.to_s.presence
      end
    actual_group = stripe_obj_field(transfer, "transfer_group").to_s.presence
    if expected_group.present? && actual_group != expected_group
      return Result.new(
        status: "failed",
        stripe_id: transfer.id,
        error: "transfer_group mismatch after create: expected=#{expected_group} got=#{actual_group.inspect}"
      )
    end

    Result.new(status: "succeeded", stripe_id: transfer.id)
  rescue Stripe::APIConnectionError, Stripe::RateLimitError => e
    classify_transfer_error(e)
  rescue Stripe::StripeError => e
    classify_transfer_error(e)
  end

  # Returns transfer_group on the Charge (or its PaymentIntent), nil if none,
  # or :unknown if Stripe lookup failed (caller must omit transfer_group to be safe).
  def self.transfer_group_on_source_charge(charge_id)
    charge = Stripe::Charge.retrieve(charge_id)
    group = stripe_obj_field(charge, "transfer_group")
    return group if group.present?

    pi_ref = stripe_obj_field(charge, "payment_intent")
    return nil if pi_ref.blank?

    pi = pi_ref.is_a?(String) ? Stripe::PaymentIntent.retrieve(pi_ref) : pi_ref
    stripe_obj_field(pi, "transfer_group")
  rescue Stripe::StripeError
    :unknown
  end

  def self.stripe_obj_field(obj, key)
    return nil if obj.nil?
    if obj.is_a?(Hash)
      val = obj[key].presence || obj[key.to_sym].presence
      return val.to_s.presence
    end

    if obj.respond_to?(:[])
      begin
        val = obj[key]
        return val.to_s.presence if val.present?
      rescue NoMethodError, TypeError
        # fall through
      end
    end
    method_name = key.to_sym
    return obj.public_send(method_name).to_s.presence if obj.respond_to?(method_name)

    nil
  rescue NoMethodError
    nil
  end

  # Explicit lookup outcomes — never conflate Stripe errors with "not found".
  class LookupResult
    STATUSES = %w[found not_found_after_complete_search lookup_failed].freeze

    attr_reader :status, :transfer, :error

    def initialize(status:, transfer: nil, error: nil)
      @status = status.to_s
      @transfer = transfer
      @error = error
    end

    def found?
      status == "found"
    end

    def not_found_after_complete_search?
      status == "not_found_after_complete_search"
    end

    def lookup_failed?
      status == "lookup_failed"
    end
  end

  # Hard cap on pages so a truncated / incomplete search cannot authorize create.
  TRANSFER_LOOKUP_MAX_PAGES = 10
  TRANSFER_LOOKUP_PAGE_SIZE = 100

  # Search platform transfers for reconciliation (separate charges and transfers).
  # Lists by transfer_group — matches groups inherited from source_transaction as well
  # as groups set explicitly on Transfer.create.
  # Returns LookupResult: found / not_found_after_complete_search / lookup_failed.
  def self.find_transfer_for_transaction(destination:, transfer_group:, transaction_id:, job_id: nil)
    if destination.blank?
      return LookupResult.new(status: "lookup_failed", error: "missing_destination")
    end
    if Stripe.api_key.blank? && !simulate_stripe?
      return LookupResult.new(status: "lookup_failed", error: "stripe_not_configured")
    end
    # Demo/unit simulate has no Stripe list API; treat as complete empty search.
    if simulate_stripe?
      return LookupResult.new(status: "not_found_after_complete_search")
    end

    starting_after = nil
    pages = 0

    loop do
      pages += 1
      if pages > TRANSFER_LOOKUP_MAX_PAGES
        return LookupResult.new(
          status: "lookup_failed",
          error: "pagination_cap_hit after #{TRANSFER_LOOKUP_MAX_PAGES} pages"
        )
      end

      params = {
        destination: destination,
        transfer_group: transfer_group,
        limit: TRANSFER_LOOKUP_PAGE_SIZE
      }.compact
      params[:starting_after] = starting_after if starting_after.present?

      list = Stripe::Transfer.list(params)
      Array(list.data).each do |tr|
        meta = tr.metadata.to_h.transform_keys(&:to_s)
        next unless meta["transaction_id"].to_s == transaction_id.to_s
        next if job_id.present? && meta["job_id"].present? && meta["job_id"].to_s != job_id.to_s

        return LookupResult.new(status: "found", transfer: tr)
      end

      break unless list.respond_to?(:has_more) ? list.has_more : false

      last_id = list.data&.last&.id
      if last_id.blank?
        return LookupResult.new(status: "lookup_failed", error: "incomplete_pagination")
      end
      starting_after = last_id
    end

    LookupResult.new(status: "not_found_after_complete_search")
  rescue Stripe::StripeError => e
    LookupResult.new(status: "lookup_failed", error: e.message.to_s.presence || e.class.name)
  rescue StandardError => e
    # Timeouts / connection errors that may not subclass Stripe::StripeError.
    LookupResult.new(status: "lookup_failed", error: e.message.to_s.presence || e.class.name)
  end

  # Explicit PaymentIntent lookup outcomes for collection reconciliation.
  # `payment_intent` is set only for "found". An error or capped search is "lookup_failed" —
  # never evidence that no PaymentIntent exists.
  class PaymentIntentLookupResult
    attr_reader :status, :payment_intent, :error

    def initialize(status:, payment_intent: nil, error: nil)
      @status = status.to_s
      @payment_intent = payment_intent
      @error = error
    end

    def found?
      status == "found"
    end

    def not_found_after_complete_search?
      status == "not_found_after_complete_search"
    end

    def lookup_failed?
      status == "lookup_failed"
    end
  end

  PI_LOOKUP_MAX_PAGES = 10
  PI_LOOKUP_PAGE_SIZE = 100
  # Clock skew / stamp-before-call margin when bounding the created window.
  PI_LOOKUP_CREATED_MARGIN = 1.hour

  # Retrieve a PaymentIntent by its stored ID. Any Stripe/transport error is lookup_failed.
  def self.retrieve_payment_intent(payment_intent_id)
    return PaymentIntentLookupResult.new(status: "lookup_failed", error: "missing_payment_intent_id") if payment_intent_id.blank?
    return PaymentIntentLookupResult.new(status: "lookup_failed", error: "stripe_not_configured") if Stripe.api_key.blank? && !simulate_stripe?
    return PaymentIntentLookupResult.new(status: "lookup_failed", error: "simulated_stripe") if simulate_stripe?

    PaymentIntentLookupResult.new(status: "found", payment_intent: Stripe::PaymentIntent.retrieve(payment_intent_id))
  rescue Stripe::InvalidRequestError => e
    # resource_missing is definitive for a retrieve by ID.
    if e.respond_to?(:code) && e.code.to_s == "resource_missing"
      PaymentIntentLookupResult.new(status: "not_found_after_complete_search", error: e.message)
    else
      PaymentIntentLookupResult.new(status: "lookup_failed", error: e.message.to_s.presence || e.class.name)
    end
  rescue Stripe::StripeError, *NETWORK_ERROR_CLASSES => e
    PaymentIntentLookupResult.new(status: "lookup_failed", error: e.message.to_s.presence || e.class.name)
  end

  # Complete search for a PaymentIntent created for a local attempt when no ID was stored
  # (the create call timed out before a response). Lists the customer's PaymentIntents created
  # since the attempt was stamped and matches on the metadata we set at create time.
  # The Search API is eventually consistent and is deliberately not used here.
  def self.find_payment_intent_for_attempt(customer_id:, metadata_key:, metadata_value:, created_after:, extra_metadata: {})
    if customer_id.blank?
      return PaymentIntentLookupResult.new(status: "lookup_failed", error: "missing_customer_id")
    end
    if created_after.blank?
      return PaymentIntentLookupResult.new(status: "lookup_failed", error: "missing_first_attempt_timestamp")
    end
    return PaymentIntentLookupResult.new(status: "lookup_failed", error: "stripe_not_configured") if Stripe.api_key.blank? && !simulate_stripe?
    return PaymentIntentLookupResult.new(status: "lookup_failed", error: "simulated_stripe") if simulate_stripe?

    starting_after = nil
    pages = 0
    loop do
      pages += 1
      if pages > PI_LOOKUP_MAX_PAGES
        return PaymentIntentLookupResult.new(status: "lookup_failed", error: "pagination_cap_hit after #{PI_LOOKUP_MAX_PAGES} pages")
      end

      params = {
        customer: customer_id,
        created: { gte: (created_after - PI_LOOKUP_CREATED_MARGIN).to_i },
        limit: PI_LOOKUP_PAGE_SIZE
      }
      params[:starting_after] = starting_after if starting_after.present?

      list = Stripe::PaymentIntent.list(params)
      Array(list.data).each do |pi|
        meta = pi.metadata.to_h.transform_keys(&:to_s)
        next unless meta[metadata_key.to_s].to_s == metadata_value.to_s
        next if extra_metadata.any? { |k, v| meta[k.to_s].present? && meta[k.to_s].to_s != v.to_s }

        return PaymentIntentLookupResult.new(status: "found", payment_intent: pi)
      end

      break unless list.respond_to?(:has_more) ? list.has_more : false

      last_id = list.data&.last&.id
      return PaymentIntentLookupResult.new(status: "lookup_failed", error: "incomplete_pagination") if last_id.blank?

      starting_after = last_id
    end

    PaymentIntentLookupResult.new(status: "not_found_after_complete_search")
  rescue Stripe::StripeError, *NETWORK_ERROR_CLASSES => e
    PaymentIntentLookupResult.new(status: "lookup_failed", error: e.message.to_s.presence || e.class.name)
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
