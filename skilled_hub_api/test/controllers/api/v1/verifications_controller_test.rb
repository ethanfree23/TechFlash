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

      test "start background check ignores requested package and node and uses configured defaults" do
        user, = create_technician_with_membership("premium", "verification-selected-package@example.com")
        with_stubbed_background_launch("http://example.com/invite-2") do
          post "/api/v1/verification/start_background_check",
               params: { package_name: "premium_criminal", node_custom_id: "houston_node" },
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :ok
        check = BackgroundCheck.order(:id).last
        assert_equal "essential", check.package_name
        assert_nil check.node_custom_id
      end

      test "start background check rejects duplicate in-progress check" do
        user, = create_technician_with_membership("basic", "verification-duplicate@example.com")
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :invited,
          payment_status: :not_required,
          paid_by: "technician"
        )

        post "/api/v1/verification/start_background_check",
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
      end

      test "background check options endpoint returns data" do
        user, = create_technician_with_membership("basic", "verification-options@example.com")
        with_stubbed_checkr_options do
          get "/api/v1/verification/background_check_options",
              headers: auth_header_for(user),
              as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["nodes_exist"]
        assert_equal "essential", body["configured_package_name"]
        assert_equal true, body["ready_for_start"]
        assert_equal "essential", body["packages"][0]["slug"]
        assert_includes body["packages"].map { |pkg| pkg["slug"] }, "essential_plus"
      end

      test "premium start returns error when checkr api key is missing" do
        user, = create_technician_with_membership("premium", "verification-no-checkr-key@example.com")
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil

        post "/api/v1/verification/start_background_check",
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
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

      def with_stubbed_checkr_options
        original_new = CheckrClient.method(:new)
        fake_client = Object.new
        fake_client.define_singleton_method(:configured?) { true }
        fake_client.define_singleton_method(:default_package) { "essential" }
        fake_client.define_singleton_method(:default_node_custom_id) { nil }
        fake_client.define_singleton_method(:list_packages) do
          [
            { "id" => "pkg_1", "slug" => "essential", "name" => "Essential" },
            { "id" => "pkg_2", "slug" => "essential_plus", "name" => "Essential Plus" }
          ]
        end
        fake_client.define_singleton_method(:list_nodes) do
          [{ "id" => "node_1", "custom_id" => "houston_node", "name" => "Houston Node", "package_slugs" => ["essential", "essential_plus"] }]
        end
        CheckrClient.singleton_class.send(:define_method, :new) { fake_client }
        yield
      ensure
        CheckrClient.singleton_class.send(:define_method, :new, original_new)
      end
    end
  end
end
