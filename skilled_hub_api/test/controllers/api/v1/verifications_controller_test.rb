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
             params: background_check_consent_params,
             headers: auth_header_for(user),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["payment_required"]
        check = BackgroundCheck.order(:id).last
        assert_equal user.id, check.user_id
        assert_equal "pending", check.payment_status
        assert_equal "technician", check.paid_by
        assert check.disclosure_accepted_at.present?
        assert check.authorization_accepted_at.present?
        assert AppNotification.where(user_id: user.id, category: "verification").exists?
      end

      test "premium technician start background check launches invitation" do
        user, profile = create_technician_with_membership("premium", "verification-premium@example.com")

        with_stubbed_background_launch("http://example.com/invite") do
          post "/api/v1/verification/start_background_check",
               params: background_check_consent_params,
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
               params: background_check_consent_params.merge(package_name: "premium_criminal", node_custom_id: "houston_node"),
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
             params: background_check_consent_params,
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
      end

      test "start background check requires disclosure and authorization consent" do
        user, = create_technician_with_membership("basic", "verification-consent-required@example.com")

        post "/api/v1/verification/start_background_check",
             params: { disclosure_accepted: true, authorization_accepted: false },
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_includes body["error"], "accept the disclosure and authorization"
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

      test "background check options support demo bypass without checkr credentials" do
        user, = create_technician_with_membership("basic", "verification-options-demo@example.com")
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil

        with_checkr_demo_bypass do
          get "/api/v1/verification/background_check_options",
              headers: auth_header_for(user),
              as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["ready_for_start"]
        assert_equal true, body["demo_bypass"]
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
      end

      test "background check options reflect disabled checkr integration" do
        user, = create_technician_with_membership("basic", "verification-options-disabled@example.com")
        old_enabled = ENV["CHECKR_ENABLED"]
        old_background_checks_enabled = ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"]
        ENV["CHECKR_ENABLED"] = "false"
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = "false"

        get "/api/v1/verification/background_check_options",
            headers: auth_header_for(user),
            as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["ready_for_start"]
        assert_equal "checkr_disabled", body["package_selection_reason"]
      ensure
        ENV["CHECKR_ENABLED"] = old_enabled
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = old_background_checks_enabled
      end

      test "premium start returns error when checkr api key is missing" do
        user, = create_technician_with_membership("premium", "verification-no-checkr-key@example.com")
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil

        post "/api/v1/verification/start_background_check",
             params: background_check_consent_params,
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
      end

      test "start background check uses demo bypass when enabled" do
        user, = create_technician_with_membership("basic", "verification-demo-bypass@example.com")
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil

        with_checkr_demo_bypass do
          post "/api/v1/verification/start_background_check",
               params: background_check_consent_params,
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["payment_required"]
        assert_equal true, body["demo_bypass"]
        assert_includes body["invitation_url"], "checkr_demo=invitation"

        check = BackgroundCheck.order(:id).last
        assert_equal "waived", check.payment_status
        assert_equal "admin", check.paid_by
        assert_equal "invitation_sent", check.normalized_status
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
      end

      test "start background check returns error when checkr is disabled and demo bypass is off" do
        user, = create_technician_with_membership("premium", "verification-disabled-start@example.com")
        old_enabled = ENV["CHECKR_ENABLED"]
        old_background_checks_enabled = ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"]
        old_demo_bypass = ENV["CHECKR_DEMO_BYPASS"]
        ENV["CHECKR_ENABLED"] = "false"
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = "false"
        ENV["CHECKR_DEMO_BYPASS"] = "false"

        post "/api/v1/verification/start_background_check",
             params: background_check_consent_params,
             headers: auth_header_for(user),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_includes body["error"], "disabled"
      ensure
        ENV["CHECKR_ENABLED"] = old_enabled
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = old_background_checks_enabled
        ENV["CHECKR_DEMO_BYPASS"] = old_demo_bypass
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

      def background_check_consent_params
        {
          disclosure_accepted: true,
          authorization_accepted: true,
          disclosure_accepted_at: Time.current.iso8601,
          authorization_accepted_at: Time.current.iso8601
        }
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

      def with_checkr_demo_bypass
        original = ENV["CHECKR_DEMO_BYPASS"]
        ENV["CHECKR_DEMO_BYPASS"] = "true"
        yield
      ensure
        ENV["CHECKR_DEMO_BYPASS"] = original
      end
    end
  end
end
