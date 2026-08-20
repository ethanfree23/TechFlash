require "test_helper"

class StripeModeGuardTest < ActiveSupport::TestCase
  test "does not block test environment" do
    assert_nil StripeModeGuard.error_message
    assert StripeModeGuard.allow_live_operations?
  end

  test "production with test key is refused without exposing the secret" do
    StripeModeGuard.stub(:production_guard_applies?, true) do
      Stripe.stub(:api_key, "sk_test_this_must_not_appear_in_errors") do
        message = StripeModeGuard.error_message
        assert_match(/not live mode/i, message)
        assert_match(/\btest\b/, message)
        refute_includes message, "sk_test_this_must_not_appear_in_errors"
        refute StripeModeGuard.allow_live_operations?
      end
    end
  end

  test "production with live key is allowed" do
    StripeModeGuard.stub(:production_guard_applies?, true) do
      Stripe.stub(:api_key, "sk_live_placeholder") do
        assert_nil StripeModeGuard.error_message
        assert StripeModeGuard.allow_live_operations?
        assert_equal "live", StripeModeGuard.mode_label
      end
    end
  end

  test "job stripe ops refuse when the production mode guard fires" do
    fake_env = ActiveSupport::StringInquirer.new("production")
    Rails.stub(:env, fake_env) do
      JobStripeOps.stub(:demo?, false) do
        StripeModeGuard.stub(:error_message, "Production Stripe secret key is not live mode (detected test). Refusing payment operations.") do
          result = JobStripeOps.create_payment_intent!(
            amount_cents: 1100,
            customer_id: "cus_x",
            payment_method_id: "pm_x",
            metadata: {},
            transfer_group: "g",
            idempotency_key: "k"
          )
          refute result.succeeded?
          assert_match(/not live mode/i, result.error)
          refute_includes result.error, "sk_test"
        end
      end
    end
  end
end
