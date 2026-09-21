# frozen_string_literal: true

require "test_helper"

# End-to-end: GHL company onboarding webhook -> existing /create-password flow -> login.
module Api
  module V1
    class PasswordSetupCompanyOnboardingTest < ActionDispatch::IntegrationTest
      SECRET = "ghl-test-secret"
      CODE = "123456"
      NEW_PASSWORD = "NewPass1!"

      setup do
        @previous_secret = ENV["GHL_WEBHOOK_SECRET"]
        ENV["GHL_WEBHOOK_SECRET"] = SECRET
        ActionMailer::Base.deliveries.clear
      end

      teardown do
        ENV["GHL_WEBHOOK_SECRET"] = @previous_secret
      end

      test "webhook-created company is eligible and completes the unchanged setup flow" do
        user = onboard_company!

        assert user.first_time_password_setup_eligible?

        with_mail_and_code { start!(user.email) }
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "code_sent", body["status"]
        challenge_id = body["challenge_id"]
        assert_equal 1, ActionMailer::Base.deliveries.size

        post "/api/v1/auth/password_setup/verify", params: { challenge_id: challenge_id, code: CODE }, as: :json
        assert_response :ok
        token = JSON.parse(response.body)["verification_token"]

        post "/api/v1/auth/password_setup/complete",
             params: { challenge_id: challenge_id, verification_token: token,
                       password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD },
             as: :json
        assert_response :ok
        assert_equal "password_created", JSON.parse(response.body)["status"]

        user.reload
        assert_equal "user", user.password_set_by
        assert user.authenticate(NEW_PASSWORD)
        refute user.first_time_password_setup_eligible?
        assert user.company?
      end

      test "once set up, the company gets already_setup rather than a new code" do
        user = onboard_company!
        user.update!(password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, password_set_actor: "user")

        with_mail_and_code do
          assert_no_difference -> { PasswordSetupChallenge.count } do
            start!(user.email)
          end
        end

        assert_equal "already_setup", JSON.parse(response.body)["status"]
      end

      test "replaying the webhook after setup does not reset the password or eligibility" do
        user = onboard_company!
        user.update!(password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD, password_set_actor: "user")

        post_company(payload.merge(idempotency_key: "pw:2"))
        assert_response :accepted
        assert_equal false, JSON.parse(response.body)["password_setup_required"]

        user.reload
        assert user.authenticate(NEW_PASSWORD)
        assert_equal "user", user.password_set_by
      end

      test "self-signup and admin-created companies are not eligible" do
        signup = User.create!(email: "signup-co@example.com", password: "CompanyPass1!", password_confirmation: "CompanyPass1!", role: :company)
        admin_made = User.create!(email: "admin-co@example.com", password: "CompanyPass1!", password_confirmation: "CompanyPass1!", role: :company, password_set_actor: "admin")
        # Defensive: a system-set company that did NOT come through GHL onboarding.
        system_no_ghl = User.create!(email: "system-co@example.com", password: "CompanyPass1!", password_confirmation: "CompanyPass1!", role: :company, password_set_actor: "system")

        [signup, admin_made, system_no_ghl].each do |u|
          refute u.first_time_password_setup_eligible?, "#{u.email} must not be eligible"
          with_mail_and_code do
            assert_no_difference -> { PasswordSetupChallenge.count } do
              start!(u.email)
            end
          end
          assert_equal "not_eligible", JSON.parse(response.body)["status"], "response for #{u.email} is unchanged"
        end
      end

      test "GHL-onboarded technicians remain eligible" do
        tech = User.create!(email: "tech-still@example.com", password: "SystemPass1!", password_confirmation: "SystemPass1!", role: :technician, password_set_actor: "system")
        assert tech.first_time_password_setup_eligible?
      end

      test "an existing company matched by the webhook keeps its own login" do
        existing = User.create!(email: "owner@pw-co.com", phone: "7135550155", password: "CompanyPass1!", password_confirmation: "CompanyPass1!", role: :company)
        profile = CompanyProfile.create!(user: existing, company_name: "PW Co", phone: "7135550155", membership_level: MembershipPolicy.default_slug_for("company"))
        existing.update_column(:company_profile_id, profile.id)

        post_company(payload)
        assert_response :accepted
        assert_equal false, JSON.parse(response.body)["created"]

        existing.reload
        assert existing.authenticate("CompanyPass1!")
        refute existing.first_time_password_setup_eligible?
      end

      private

      def onboard_company!
        post_company(payload)
        assert_response :accepted
        User.find(JSON.parse(response.body)["user_id"])
      end

      def post_company(body)
        post "/api/v1/webhooks/ghl/company_onboarding",
             params: body, headers: { "Authorization" => "Bearer #{SECRET}" }, as: :json
      end

      def payload
        {
          idempotency_key: "pw:1",
          ghl_contact_id: "gc_pw",
          ghl_location_id: "loc_001",
          company_name: "PW Co",
          email: "owner@pw-co.com",
          phone: "7135550155",
          staffing_type: "Both"
        }
      end

      def with_mail_and_code
        MailDelivery.stub(:safe_deliver_result, ->(&block) { { success: true, value: block.call, code: "ok" } }) do
          PasswordSetupChallenge.stub(:generate_code, CODE) { yield }
        end
      end

      def start!(email)
        post "/api/v1/auth/password_setup/start", params: { email: email }, as: :json
      end
    end
  end
end
