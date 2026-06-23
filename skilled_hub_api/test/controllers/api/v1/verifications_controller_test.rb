require "test_helper"

module Api
  module V1
    class VerificationsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "verification endpoints require technician role" do
        get "/api/v1/verification", as: :json
        assert_response :unauthorized

        company_user = User.create!(
          email: "verification-company-forbidden@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)

        get "/api/v1/verification",
            headers: auth_header_for(company_user),
            as: :json
        assert_response :forbidden
      end

      test "non premium technician start background check requires payment" do
        user, profile = create_technician_with_membership("basic", "verification-basic@example.com")

        post "/api/v1/verification/start_background_check",
             headers: auth_header_for(user),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["payment_required"]
        check = BackgroundCheck.order(:id).last
        assert_equal user.id, check.user_id
        assert_equal "pending", check.payment_status
        assert_equal "technician", check.paid_by
        assert AppNotification.where(user_id: user.id, category: "verification").exists?
      end

      test "premium technician start background check launches invitation" do
        user, profile = create_technician_with_membership("premium", "verification-premium@example.com")

        with_stubbed_background_launch("http://example.com/invite") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["payment_required"]
        assert_equal "http://example.com/invite", body["invitation_url"]
      end

      test "create background checkout returns checkout url for pending payment" do
        user, profile = create_technician_with_membership("basic", "verification-checkout@example.com")
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          payment_status: :pending,
          paid_by: "technician",
          status: :not_started
        )

        with_stubbed_checkout_session("https://checkout.stripe.test/session_1") do
          post "/api/v1/verification/create_background_check_checkout",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "https://checkout.stripe.test/session_1", body["checkout_url"]
        check.reload
        assert_equal "cs_test_123", check.stripe_checkout_session_id
      end

      test "create background checkout fails when no pending payment exists" do
        user, profile = create_technician_with_membership("basic", "verification-no-pending-checkout@example.com")

        post "/api/v1/verification/create_background_check_checkout",
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
      end

      private

      def create_technician_with_membership(level, email)
        user = User.create!(
          email: email,
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: level
        )
        [user, profile]
      end

      def with_stubbed_background_launch(invitation_url)
        singleton = BackgroundCheckStartService.singleton_class
        original = BackgroundCheckStartService.method(:launch_checkr_invitation!)
        singleton.send(:define_method, :launch_checkr_invitation!) do |_check|
          { "id" => "inv_1", "invitation_url" => invitation_url }
        end
        yield
      ensure
        singleton.send(:define_method, :launch_checkr_invitation!, original)
      end

      def with_stubbed_checkout_session(url)
        singleton = BackgroundCheckStartService.singleton_class
        original = BackgroundCheckStartService.method(:create_checkout_session!)
        session = Struct.new(:id, :url).new("cs_test_123", url)
        singleton.send(:define_method, :create_checkout_session!) do |check|
          check.update!(stripe_checkout_session_id: session.id)
          session
        end
        yield
      ensure
        singleton.send(:define_method, :create_checkout_session!, original)
      end
    end
  end
end
