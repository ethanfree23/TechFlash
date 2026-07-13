require "test_helper"

module Api
  module V1
    class UsersControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def base_signup_params(overrides = {})
        {
          email: "user-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          first_name: "Test",
          last_name: "User",
          role: "technician",
          membership_tier: "basic",
          phone: "713-555-1212",
          address: "123 Main St",
          city: "Houston",
          state: "Texas",
          zip_code: "77007",
          country: "United States"
        }.merge(overrides)
      end

      def company_profile_params
        {
          company_name: "Acme Test Company",
          industry: "Electrician",
          primary_hiring_need: "Short-term labor coverage"
        }
      end

      test "signup requires phone" do
        post "/api/v1/users",
             params: base_signup_params(phone: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/phone is required/i, body["error"].to_s)
      end

      test "signup requires first name" do
        post "/api/v1/users",
             params: base_signup_params(first_name: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/first_name is required/i, body["error"].to_s)
      end

      test "signup requires last name" do
        post "/api/v1/users",
             params: base_signup_params(last_name: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/last_name is required/i, body["error"].to_s)
      end

      test "signup requires city" do
        post "/api/v1/users",
             params: base_signup_params(city: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/city is required/i, body["error"].to_s)
      end

      test "signup requires state" do
        post "/api/v1/users",
             params: base_signup_params(state: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/state is required/i, body["error"].to_s)
      end

      test "signup requires zip code" do
        post "/api/v1/users",
             params: base_signup_params(zip_code: ""),
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/zip_code is required/i, body["error"].to_s)
      end

      test "technician signup stores phone and location fields in profile" do
        post "/api/v1/users",
             params: base_signup_params(
               email: "tech-with-location@example.com",
               role: "technician",
               trade_type: "Electrician",
               phone: "713-444-9988",
               address: "500 Market St",
               city: "Houston",
               state: "Texas",
               zip_code: "77002"
             ),
             as: :json

        assert_response :created
        user = User.find_by!(email: "tech-with-location@example.com")
        profile = user.technician_profile
        assert_not_nil profile
        assert_equal "713-444-9988", profile.phone
        assert_equal "500 Market St", profile.address
        assert_equal "Houston", profile.city
        assert_equal "Texas", profile.state
        assert_equal "77002", profile.zip_code
      end

      test "company signup stores phone and normalized location fields in profile" do
        post "/api/v1/users",
             params: base_signup_params(
               {
                 email: "company-with-location@example.com",
                 role: "company",
                 phone: "713-333-1122",
                 city: "Houston",
                 state: "Texas",
                 zip_code: "77007",
                 electrical_license_number: "TECL-12345"
               }.merge(company_profile_params)
             ),
             as: :json

        assert_response :created
        user = User.find_by!(email: "company-with-location@example.com")
        assert_equal "company", user.role
        profile = user.company_profile
        assert_not_nil profile
        assert_equal "Acme Test Company", profile.company_name
        assert_equal "Electrician", profile.industry
        assert_equal "713-333-1122", profile.phone
        assert_equal "Texas", profile.state
        assert_equal ["Houston"], profile.service_cities
        assert_match(/Houston/i, profile.location.to_s)
        assert_match(/77007/i, profile.location.to_s)
      end

      test "company signup allows missing electrical license number in statewide-license state" do
        post "/api/v1/users",
             params: base_signup_params(
               {
                 email: "company-california-no-license@example.com",
                 role: "company",
                 state: "California",
                 city: "Los Angeles",
                 zip_code: "90012"
               }.merge(company_profile_params)
             ),
             as: :json

        assert_response :created
        user = User.find_by!(email: "company-california-no-license@example.com")
        profile = user.company_profile
        assert_not_nil profile
        assert_nil profile.electrical_license_number
      end

      test "company signup in local-license state does not require electrical license number" do
        PlatformSetting.set_local_only_license_state_codes!(["NY"])

        post "/api/v1/users",
             params: base_signup_params(
               {
                 email: "company-newyork-no-license@example.com",
                 role: "company",
                 city: "New York",
                 state: "New York",
                 zip_code: "10001"
               }.merge(company_profile_params)
             ),
             as: :json

        assert_response :created
      end

      test "update me persists notification preferences" do
        user = User.create!(
          email: "notify-settings-user@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )

        patch "/api/v1/users/me",
              params: {
                email_notifications_enabled: false,
                job_alert_notifications_enabled: false,
                email_notification_preferences: {
                  messages: false,
                  job_lifecycle: true,
                  reviews: false,
                  membership_updates: true
                }
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        user.reload
        assert_equal false, user.email_notifications_enabled
        assert_equal false, user.job_alert_notifications_enabled
        assert_equal false, user.email_notification_preferences_hash["messages"]
        assert_equal true, user.email_notification_preferences_hash["job_lifecycle"]

        body = JSON.parse(response.body)
        assert_equal false, body.dig("user", "email_notifications_enabled")
        assert_equal false, body.dig("user", "job_alert_notifications_enabled")
        assert_equal false, body.dig("user", "email_notification_preferences", "messages")
        assert_equal true, body.dig("user", "email_notification_preferences", "job_lifecycle")
      end

      test "update me merges ui_preferences and preserves other keys" do
        user = User.create!(
          email: "ui-prefs-user@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin,
          phone: "713-555-0100"
        )
        user.update_column(:ui_preferences, { "legacy_flag" => true })

        cols = [
          { key: "email", visible: false },
          { key: "company", visible: true }
        ]
        cols_json = cols.map { |h| h.stringify_keys }

        patch "/api/v1/users/me",
              params: {
                ui_preferences: {
                  table_columns: {
                    admin_users: cols
                  }
                }
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        user.reload
        assert_equal true, user.ui_preferences_hash["legacy_flag"]
        assert_equal cols_json, user.ui_preferences_hash.dig("table_columns", "admin_users")

        body = JSON.parse(response.body)
        assert_equal cols_json, body.dig("user", "ui_preferences", "table_columns", "admin_users")
        assert_equal true, body.dig("user", "ui_preferences", "legacy_flag")
      end

      test "update me ui_preferences only succeeds for admin without phone" do
        user = User.create!(
          email: "ui-prefs-no-phone-admin@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        assert user.phone.blank?

        cols = [{ key: "email", visible: false }]
        patch "/api/v1/users/me",
              params: {
                ui_preferences: {
                  table_columns: {
                    admin_users: cols
                  }
                }
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        user.reload
        assert_equal cols.map { |h| h.stringify_keys }, user.ui_preferences_hash.dig("table_columns", "admin_users")
      end

      test "update me ui_preferences deep merges table_columns without wiping other tables" do
        user = User.create!(
          email: "ui-prefs-multi-table@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin,
          phone: "713-555-0900"
        )
        user.update_column(:ui_preferences, {
                             "table_columns" => {
                               "crm_pipeline" => [{ "key" => "status", "visible" => false }]
                             }
                           })

        patch "/api/v1/users/me",
              params: {
                ui_preferences: {
                  table_columns: {
                    admin_users: [{ key: "email", visible: true }]
                  }
                }
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        user.reload
        assert_equal [{ "key" => "email", "visible" => true }],
                     user.ui_preferences_hash.dig("table_columns", "admin_users")
        assert_equal [{ "key" => "status", "visible" => false }],
                     user.ui_preferences_hash.dig("table_columns", "crm_pipeline")
      end

      test "login history returns current user login events only" do
        user = User.create!(
          email: "login-history-user@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        other = User.create!(
          email: "login-history-other@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )

        older = UserLoginEvent.create!(user: user, via_masquerade: false, created_at: 2.days.ago, updated_at: 2.days.ago)
        newer = UserLoginEvent.create!(user: user, via_masquerade: false, created_at: 1.day.ago, updated_at: 1.day.ago)
        UserLoginEvent.create!(user: user, via_masquerade: true, created_at: 1.hour.ago, updated_at: 1.hour.ago)
        UserLoginEvent.create!(user: other, via_masquerade: false, created_at: Time.current, updated_at: Time.current)

        get "/api/v1/users/me/login_history",
            headers: auth_header_for(user),
            as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        history = body["login_history"]
        assert_equal 2, history.length
        assert_equal newer.id, history[0]["id"]
        assert_equal older.id, history[1]["id"]
        assert_not_nil history[0]["logged_in_at"]
      end
    end
  end
end
