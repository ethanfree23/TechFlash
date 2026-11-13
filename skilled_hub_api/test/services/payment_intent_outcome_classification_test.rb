# frozen_string_literal: true

require "test_helper"
require "ostruct"

# PaymentIntent create outcome classification: definitive failure vs outcome unknown.
class PaymentIntentOutcomeClassificationTest < ActiveSupport::TestCase
  PM_META = { payment_method_id: "pm_bank_1", payment_method_type: "us_bank_account", payment_method_last4: "6789", payment_method_bank_name: "Chase" }.freeze

  def with_live_path(&block)
    old_key = Stripe.api_key
    Stripe.api_key = "sk_test_classification"
    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        JobStripeOps.stub(:payment_method_display, PM_META) do
          AchAccess.stub(:assert_allowed!, true, &block)
        end
      end
    end
  ensure
    Stripe.api_key = old_key
  end

  def create_raising(error)
    with_live_path do
      Stripe::PaymentIntent.stub(:create, ->(*_args) { raise error }) do
        JobStripeOps.create_payment_intent!(
          amount_cents: 500, customer_id: "cus_1", payment_method_id: "pm_bank_1",
          metadata: { "transaction_id" => "1" }, transfer_group: "job_1", idempotency_key: "k1"
        )
      end
    end
  end

  test "Stripe timeout before any response is outcome_unknown, not failed" do
    result = create_raising(Stripe::APIConnectionError.new("Timed out reading data from server"))
    assert result.outcome_unknown?
    refute result.failed?
    assert_nil result.stripe_id
    assert_equal "Stripe::APIConnectionError", result.error_class
  end

  test "raw transport errors that escape the Stripe client are outcome_unknown" do
    [Net::ReadTimeout.new, Errno::ECONNRESET.new, EOFError.new("end of file"), OpenSSL::SSL::SSLError.new("reset")].each do |err|
      result = create_raising(err)
      assert result.outcome_unknown?, "#{err.class} should be outcome_unknown"
    end
  end

  test "Stripe 5xx is outcome_unknown" do
    err = Stripe::APIError.new("Internal error", http_status: 502)
    assert create_raising(err).outcome_unknown?
  end

  test "rate limit is outcome_unknown" do
    assert create_raising(Stripe::RateLimitError.new("Too many requests", http_status: 429)).outcome_unknown?
  end

  test "idempotency conflict proves a prior attempt reached Stripe and is outcome_unknown" do
    err = Stripe::IdempotencyError.new("Keys for idempotent requests can only be used with the same parameters", http_status: 400)
    assert create_raising(err).outcome_unknown?
  end

  test "invalid request (4xx) is a definitive failure" do
    err = Stripe::InvalidRequestError.new("No such payment_method", "payment_method", http_status: 400, code: "resource_missing")
    result = create_raising(err)
    assert result.failed?
    assert_equal 400, result.http_status
  end

  test "card error is a definitive failure and keeps the PaymentIntent id when Stripe returns one" do
    body = { "error" => { "message" => "Your card was declined.", "payment_intent" => { "id" => "pi_declined_1" } } }
    err = Stripe::CardError.new("Your card was declined.", "card", code: "card_declined", http_status: 402, json_body: body)
    result = create_raising(err)
    assert result.failed?
    assert_equal "pi_declined_1", result.stripe_id
  end

  test "authentication and permission errors are definitive failures" do
    assert create_raising(Stripe::AuthenticationError.new("bad key", http_status: 401)).failed?
    assert create_raising(Stripe::PermissionError.new("nope", http_status: 403)).failed?
  end

  test "unclassifiable StripeError with no http status falls closed to outcome_unknown" do
    assert create_raising(Stripe::StripeError.new("something odd")).outcome_unknown?
  end

  test "retrieve by id: resource_missing is a complete not-found; other errors are lookup_failed" do
    with_live_path do
      missing = Stripe::InvalidRequestError.new("No such payment_intent", "id", http_status: 404, code: "resource_missing")
      Stripe::PaymentIntent.stub(:retrieve, ->(*_a) { raise missing }) do
        assert JobStripeOps.retrieve_payment_intent("pi_x").not_found_after_complete_search?
      end
      Stripe::PaymentIntent.stub(:retrieve, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        assert JobStripeOps.retrieve_payment_intent("pi_x").lookup_failed?
      end
      Stripe::PaymentIntent.stub(:retrieve, ->(*_a) { OpenStruct.new(id: "pi_x", status: "processing") }) do
        assert JobStripeOps.retrieve_payment_intent("pi_x").found?
      end
    end
  end

  test "attempt search: match on metadata, complete not-found, capped pagination and errors are lookup_failed" do
    with_live_path do
      page = ->(data, more) { OpenStruct.new(data: data, has_more: more) }
      found_pi = OpenStruct.new(id: "pi_found", metadata: { "transaction_id" => "42", "job_id" => "7" })
      other_pi = OpenStruct.new(id: "pi_other", metadata: { "transaction_id" => "41", "job_id" => "7" })

      Stripe::PaymentIntent.stub(:list, ->(*_a) { page.call([other_pi, found_pi], false) }) do
        r = JobStripeOps.find_payment_intent_for_attempt(customer_id: "cus_1", metadata_key: "transaction_id", metadata_value: 42, created_after: 1.hour.ago)
        assert r.found?
        assert_equal "pi_found", r.payment_intent.id
      end

      Stripe::PaymentIntent.stub(:list, ->(*_a) { page.call([other_pi], false) }) do
        r = JobStripeOps.find_payment_intent_for_attempt(customer_id: "cus_1", metadata_key: "transaction_id", metadata_value: 42, created_after: 1.hour.ago)
        assert r.not_found_after_complete_search?
      end

      Stripe::PaymentIntent.stub(:list, ->(*_a) { page.call([other_pi], true) }) do
        r = JobStripeOps.find_payment_intent_for_attempt(customer_id: "cus_1", metadata_key: "transaction_id", metadata_value: 42, created_after: 1.hour.ago)
        assert r.lookup_failed?, "infinite has_more must hit the page cap and be lookup_failed"
        assert_match(/pagination_cap_hit/, r.error)
      end

      Stripe::PaymentIntent.stub(:list, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        r = JobStripeOps.find_payment_intent_for_attempt(customer_id: "cus_1", metadata_key: "transaction_id", metadata_value: 42, created_after: 1.hour.ago)
        assert r.lookup_failed?
      end

      r = JobStripeOps.find_payment_intent_for_attempt(customer_id: nil, metadata_key: "transaction_id", metadata_value: 42, created_after: 1.hour.ago)
      assert r.lookup_failed?, "missing customer can never be proof of absence"
    end
  end
end
