require "test_helper"

module Api
  module V1
    class MembershipsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "show returns effective membership payload for company" do
        user = User.create!(email: "membership-show-company@example.com", password: "password123", password_confirmation: "password123", role: :company)
        profile = CompanyProfile.create!(user: user, membership_level: "premium", membership_fee_waived: true, commission_override_percent: 0)
        user.update_column(:company_profile_id, profile.id)

        get "/api/v1/membership", headers: auth_header_for(user)

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "premium", body["membership_level"]
        assert_equal 0, body["monthly_fee_cents"]
        assert_equal 0.0, body["commission_percent"].to_f
      end

      test "update with basic clears subscription details" do
        user = User.create!(email: "membership-basic-company@example.com", password: "password123", password_confirmation: "password123", role: :company)
        profile = CompanyProfile.create!(
          user: user,
          membership_level: "pro",
          stripe_membership_subscription_id: "sub_test_123",
          membership_status: "active",
          membership_current_period_end_at: 2.weeks.from_now
        )
        user.update_column(:company_profile_id, profile.id)

        # cancel_for_basic! no-ops when Stripe is not configured; controller still clears local subscription fields.
        patch "/api/v1/membership", params: { membership_level: "basic" }, headers: auth_header_for(user), as: :json

        assert_response :ok
        profile.reload
        assert_equal "basic", profile.membership_level
        assert_nil profile.stripe_membership_subscription_id
      end

      test "update with paid tier returns checkout payload" do
        user = User.create!(email: "membership-paid-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: user, membership_level: "basic", trade_type: "General", availability: "Full-time")

        checkout_payload = { session_id: "cs_test_123", url: "https://example.test/checkout" }
        with_stubbed_membership_checkout_session!(checkout_payload) do
          patch "/api/v1/membership",
                params: { membership_level: "pro", success_url: "https://app/success", cancel_url: "https://app/cancel" },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "pro", body["pending_membership_level"]
        assert_equal "cs_test_123", body.dig("checkout", "session_id")
      end

      private

      # Mocha-style Class.stub is not loaded in this app; temporarily replace the singleton method.
      def with_stubbed_membership_checkout_session!(return_value)
        sc = MembershipSubscriptionService.singleton_class
        sc.alias_method :__orig_create_checkout_session!, :create_checkout_session!
        sc.define_method(:create_checkout_session!) { |**_| return_value }
        yield
      ensure
        sc.remove_method :create_checkout_session!
        sc.alias_method :create_checkout_session!, :__orig_create_checkout_session!
        sc.remove_method :__orig_create_checkout_session!
      end
    end
  end
end
