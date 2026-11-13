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

      test "basic technician start background check does not require payment and launches invitation" do
        user, = create_technician_with_membership("basic", "verification-basic@example.com")
        accept_acknowledgements!(user)

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          with_stubbed_checkr_options do
            with_stubbed_background_launch("http://example.com/invite-basic") do
              post "/api/v1/verification/start_background_check",
                   headers: auth_header_for(user),
                   as: :json
            end
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["payment_required"]
        assert_equal "http://example.com/invite-basic", body["invitation_url"]
        check = BackgroundCheck.order(:id).last
        assert_equal user.id, check.user_id
        assert_equal "waived", check.payment_status
        assert_equal "platform", check.paid_by
        assert check.disclosure_accepted_at.present?
        assert check.authorization_accepted_at.present?
      end

      test "acknowledgements persist via dedicated endpoint and hydrate on show" do
        user, = create_technician_with_membership("basic", "verification-ack-persist@example.com")

        post "/api/v1/verification/background_check_acknowledgements",
             params: { acknowledgement_type: "platform_notice", accepted: true },
             headers: auth_header_for(user),
             as: :json
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body.dig("acknowledgement", "accepted")
        assert body.dig("acknowledgement", "document_version").present?

        get "/api/v1/verification", headers: auth_header_for(user), as: :json
        assert_response :ok
        acks = JSON.parse(response.body).fetch("background_check_acknowledgements")
        notice = acks.find { |row| row["acknowledgement_type"] == "platform_notice" }
        assert_equal true, notice["accepted"]
        assert notice["accepted_at"].present?
      end

      test "start background check blocked without acknowledgements" do
        user, = create_technician_with_membership("basic", "verification-ack-block@example.com")
        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end
        assert_response :unprocessable_entity
        assert_equal "acknowledgements_required", JSON.parse(response.body)["code"]
      end

      test "start background check refuses to create a second check while a paid one awaits its invitation" do
        user, = create_technician_with_membership("basic", "verification-paid-awaiting@example.com")
        accept_acknowledgements!(user)
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :failed,
          payment_status: :paid,
          paid_by: "technician",
          payment_amount_cents: 8000,
          paid_at: Time.current,
          admin_notes: "Checkr invitation failed (will retry): Checkr 503"
        )

        assert_no_difference -> { BackgroundCheck.where(user_id: user.id).count } do
          with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
            post "/api/v1/verification/start_background_check",
                 headers: auth_header_for(user),
                 as: :json
          end
        end

        assert_response :unprocessable_entity
        assert_equal "awaiting_invitation_fulfillment", JSON.parse(response.body)["code"]
      end

      test "premium technician start background check launches invitation" do
        user, = create_technician_with_membership("premium", "verification-premium@example.com")
        accept_acknowledgements!(user)

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          with_stubbed_checkr_options do
            with_stubbed_background_launch("http://example.com/invite") do
              post "/api/v1/verification/start_background_check",
                   headers: auth_header_for(user),
                   as: :json
            end
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["payment_required"]
        assert_equal "http://example.com/invite", body["invitation_url"]
      end

      test "start background check ignores requested package and node and uses configured defaults" do
        user, = create_technician_with_membership("premium", "verification-selected-package@example.com")
        accept_acknowledgements!(user)
        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          with_stubbed_checkr_options do
            with_stubbed_background_launch("http://example.com/invite-2") do
              post "/api/v1/verification/start_background_check",
                   params: { package_name: "premium_criminal", node_custom_id: "houston_node" },
                   headers: auth_header_for(user),
                   as: :json
            end
          end
        end

        assert_response :ok
        check = BackgroundCheck.order(:id).last
        assert_equal "essential", check.package_name
        assert_nil check.node_custom_id
      end

      test "start background check rejects duplicate in-progress check" do
        user, = create_technician_with_membership("basic", "verification-duplicate@example.com")
        accept_acknowledgements!(user)
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :invited,
          payment_status: :waived,
          paid_by: "platform"
        )

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
      end

      test "start background check fails closed when work location missing" do
        user, profile = create_technician_with_membership("basic", "verification-no-location@example.com")
        profile.update_columns(city: nil, state: nil, country: nil)
        accept_acknowledgements!(user)
        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end
        assert_response :unprocessable_entity
        assert_equal "work_location_required", JSON.parse(response.body)["code"]
      end

      test "demo undo clears in-progress background check so technician can retry" do
        user, = create_technician_with_membership("basic", "verification-demo-reset@example.com")
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :invited,
          normalized_status: "invitation_sent",
          payment_status: :pending,
          paid_by: "technician"
        )

        with_demo_mode_enabled do
          post "/api/v1/verification/reset_demo_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :ok
        check.reload
        assert_equal "failed", check.status
        assert_equal "failed", check.payment_status
        assert_equal "canceled", check.normalized_status
        assert_equal "demo_reset", check.provider_status
      end

      test "demo undo is forbidden when demo mode is off" do
        user, = create_technician_with_membership("basic", "verification-demo-reset-forbidden@example.com")

        post "/api/v1/verification/reset_demo_background_check",
             headers: auth_header_for(user),
             as: :json

        assert_response :forbidden
      end

      test "start background check requires TechFlash acknowledgements" do
        user, = create_technician_with_membership("basic", "verification-consent-required@example.com")

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "acknowledgements_required", body["code"]
      end

      test "background check options endpoint returns data" do
        user, = create_technician_with_membership("basic", "verification-options@example.com")
        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          with_stubbed_checkr_options do
            get "/api/v1/verification/background_check_options",
                headers: auth_header_for(user),
                as: :json
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["nodes_exist"]
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
        accept_acknowledgements!(user)
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        old_secret = ENV["CHECKR_SECRET_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil
        ENV["CHECKR_SECRET_KEY"] = nil

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
        ENV["CHECKR_SECRET_KEY"] = old_secret
      end

      test "start background check uses demo bypass when enabled" do
        user, = create_technician_with_membership("basic", "verification-demo-bypass@example.com")
        accept_acknowledgements!(user)
        old_staging = ENV["CHECKR_STAGING_API_KEY"]
        old_api = ENV["CHECKR_API_KEY"]
        ENV["CHECKR_STAGING_API_KEY"] = nil
        ENV["CHECKR_API_KEY"] = nil

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          with_checkr_demo_bypass do
            post "/api/v1/verification/start_background_check",
                 headers: auth_header_for(user),
                 as: :json
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal false, body["payment_required"]
        assert_equal true, body["demo_bypass"]
        assert_includes body["invitation_url"], "checkr_demo=invitation"

        check = BackgroundCheck.order(:id).last
        assert_equal "waived", check.payment_status
        assert_equal "platform", check.paid_by
        assert_equal "invitation_sent", check.normalized_status
      ensure
        ENV["CHECKR_STAGING_API_KEY"] = old_staging
        ENV["CHECKR_API_KEY"] = old_api
      end

      test "start background check returns error when checkr is disabled and demo bypass is off" do
        user, = create_technician_with_membership("premium", "verification-disabled-start@example.com")
        accept_acknowledgements!(user)
        old_enabled = ENV["CHECKR_ENABLED"]
        old_background_checks_enabled = ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"]
        old_demo_bypass = ENV["CHECKR_DEMO_BYPASS"]
        ENV["CHECKR_ENABLED"] = "false"
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = "false"
        ENV["CHECKR_DEMO_BYPASS"] = "false"

        with_env("CHECKR_DEFAULT_PACKAGE" => "essential") do
          post "/api/v1/verification/start_background_check",
               headers: auth_header_for(user),
               as: :json
        end

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_includes body["error"], "disabled"
      ensure
        ENV["CHECKR_ENABLED"] = old_enabled
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = old_background_checks_enabled
        ENV["CHECKR_DEMO_BYPASS"] = old_demo_bypass
      end

      test "create background checkout is disabled for technicians" do
        user, = create_technician_with_membership("basic", "verification-checkout@example.com")
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          payment_status: :pending,
          paid_by: "technician",
          status: :not_started
        )

        post "/api/v1/verification/create_background_check_checkout",
             headers: auth_header_for(user),
             as: :json

        assert_response :gone
        body = JSON.parse(response.body)
        assert_equal "technician_background_check_payment_disabled", body["code"]
        assert_equal false, body["payment_required"]
      end

      test "technician verification response does not expose checkr report or dashboard links" do
        user, = create_technician_with_membership("basic", "verification-link-redaction@example.com")
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :pending,
          normalized_status: "report_pending",
          report_url: "https://api.checkr.com/v1/reports/rep_123",
          dashboard_url: "https://dashboard.checkr.com/reports/rep_123",
          payment_status: :paid,
          paid_by: "technician"
        )

        get "/api/v1/verification",
            headers: auth_header_for(user),
            as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        section = body.fetch("sections").find { |s| s["key"] == "background_check" }
        assert section.present?
        assert_nil section["report_url"]
        assert_nil section["dashboard_url"]
      end

      private

      def create_technician_with_membership(level, email)
        user = User.create!(
          email: email,
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          first_name: "Tech",
          last_name: "User"
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: level,
          city: "Houston",
          state: "TX",
          country: "US",
          zip_code: "77002"
        )
        [user, profile]
      end

      def accept_acknowledgements!(user)
        BackgroundCheckAcknowledgement::TYPES.each do |type|
          BackgroundCheckAcknowledgementService.upsert!(
            user: user,
            acknowledgement_type: type,
            accepted: true,
            actor_user: user
          )
        end
      end

      def with_env(overrides)
        previous = overrides.keys.to_h { |key| [key, ENV[key]] }
        overrides.each do |key, value|
          if value.nil?
            ENV.delete(key)
          else
            ENV[key] = value
          end
        end
        yield
      ensure
        previous.each do |key, value|
          if value.nil?
            ENV.delete(key)
          else
            ENV[key] = value
          end
        end
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
        # Zero nodes: segmentation may be enabled but invitations omit `node`.
        fake_client.define_singleton_method(:list_nodes) { [] }
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

      def with_demo_mode_enabled
        original = ENV["DEMO_MODE"]
        ENV["DEMO_MODE"] = "true"
        yield
      ensure
        ENV["DEMO_MODE"] = original
      end
    end
  end
end
