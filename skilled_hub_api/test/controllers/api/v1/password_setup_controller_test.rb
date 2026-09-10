# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class PasswordSetupControllerTest < ActionDispatch::IntegrationTest
      CODE = "123456"
      NEW_PASSWORD = "NewPass1!"
      SYSTEM_PASSWORD = "SystemPass1!"

      setup do
        ActionMailer::Base.deliveries.clear
        @user = create_system_tech!("ghl-setup@example.com")
      end

      test "existing ghl-created technician starts a verification challenge" do
        with_mail_and_code do
          assert_difference -> { PasswordSetupChallenge.count }, 1 do
            start!(@user.email)
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "code_sent", body["status"]
        assert body["challenge_id"].present?
        assert_equal @user.masked_email, body["masked_email"]
        refute body.key?("user_id")
        refute body.key?("verification_token")
        refute_includes body.values.map(&:to_s).join, CODE

        challenge = PasswordSetupChallenge.find_by!(public_id: body["challenge_id"])
        assert_equal @user.id, challenge.user_id
        refute_equal CODE, challenge.code_digest
        assert challenge.code_matches?(CODE)
        assert_equal 1, ActionMailer::Base.deliveries.size
        assert_includes ActionMailer::Base.deliveries.last.text_part.body.decoded, CODE
      end

      test "unknown email does not create an account" do
        with_mail_and_code do
          assert_no_difference -> { User.count } do
            assert_no_difference -> { PasswordSetupChallenge.count } do
              start!("missing-setup@example.com")
            end
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "not_eligible", body["status"]
        assert_match(/couldn.t verify that email/i, body["error"])
      end

      test "correct code allows password creation" do
        token = verify_code!(@user)
        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: NEW_PASSWORD,
          password_confirmation: NEW_PASSWORD
        )

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "password_created", body["status"]
        refute body.key?("token")
        refute body.key?("password")
      end

      test "incorrect code is rejected" do
        start_challenge!(@user)
        verify!("000000")

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "invalid_code", body["status"]
      end

      test "expired code is rejected" do
        start_challenge!(@user)
        travel 11.minutes do
          verify!(CODE)
        end

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "invalid_or_expired", body["status"]
      end

      test "too many incorrect attempts locks the challenge" do
        start_challenge!(@user)
        4.times { verify!("000000") }
        verify!("000000")

        assert_response :unprocessable_entity
        assert_equal "locked", JSON.parse(response.body)["status"]

        verify!(CODE)
        assert_response :unprocessable_entity
        assert_equal "locked", JSON.parse(response.body)["status"]
      end

      test "used challenge cannot be reused" do
        token = verify_code!(@user)
        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: NEW_PASSWORD,
          password_confirmation: NEW_PASSWORD
        )
        assert_response :ok

        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: "OtherPass1!",
          password_confirmation: "OtherPass1!"
        )
        assert_response :unprocessable_entity
        assert_equal "invalid_or_expired", JSON.parse(response.body)["status"]
      end

      test "password mismatch is rejected" do
        token = verify_code!(@user)
        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: NEW_PASSWORD,
          password_confirmation: "Mismatch1!"
        )

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal "mismatch", body["status"]
        @user.reload
        assert @user.authenticate(SYSTEM_PASSWORD)
      end

      test "successful password creation allows login with the new password" do
        token = verify_code!(@user)
        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: NEW_PASSWORD,
          password_confirmation: NEW_PASSWORD
        )
        assert_response :ok

        @user.reload
        assert_equal "user", @user.password_set_by
        post "/api/v1/sessions", params: { email: @user.email, password: NEW_PASSWORD }, as: :json
        assert_response :ok
        assert JSON.parse(response.body)["token"].present?
      end

      test "old system password no longer works after setup" do
        token = verify_code!(@user)
        complete!(
          challenge_id: @challenge_id,
          verification_token: token,
          password: NEW_PASSWORD,
          password_confirmation: NEW_PASSWORD
        )
        assert_response :ok

        post "/api/v1/sessions", params: { email: @user.email, password: SYSTEM_PASSWORD }, as: :json
        assert_response :unauthorized
        refute @user.reload.authenticate(@user.email)
      end

      test "established technician cannot overwrite password via first-time setup" do
        established = User.create!(
          email: "established-setup@example.com",
          password: "UserPass1!",
          password_confirmation: "UserPass1!",
          role: :technician,
          password_set_actor: "user"
        )

        with_mail_and_code { start!(established.email) }
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "already_setup", body["status"]
        assert_equal 0, PasswordSetupChallenge.where(user_id: established.id).count

        established.reload
        assert established.authenticate("UserPass1!")
      end

      test "forgot-password flow still works" do
        MailDelivery.stub(:safe_deliver_result, ->(&_) { { success: true, code: "ok" } }) do
          post "/api/v1/password_resets", params: { email: @user.email }, as: :json
        end

        assert_response :no_content
        @user.reload
        assert @user.password_reset_token.present?
        assert @user.password_reset_token_active?
      end

      test "email lookup is case-insensitive" do
        with_mail_and_code { start!("GHL-SETUP@EXAMPLE.COM") }

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "code_sent", body["status"]
        assert_equal 1, PasswordSetupChallenge.where(user_id: @user.id).count
      end

      test "start does not authenticate or skip verification" do
        with_mail_and_code { start!(@user.email) }
        body = JSON.parse(response.body)

        complete!(
          challenge_id: body["challenge_id"],
          verification_token: "not-verified",
          password: NEW_PASSWORD,
          password_confirmation: NEW_PASSWORD
        )

        assert_response :unprocessable_entity
        assert_equal "invalid_or_expired", JSON.parse(response.body)["status"]
        assert @user.reload.authenticate(SYSTEM_PASSWORD)
      end

      test "rate limiting is enforced by email and ip" do
        with_mail_and_code do
          20.times { |i| start!("rate-ip-#{i}@missing.example") }
          start!("rate-ip-final@missing.example")
        end
        assert_response :too_many_requests
        assert_equal "rate_limited", JSON.parse(response.body)["status"]

        AuthRateLimit.delete_all

        with_mail_and_code do
          5.times { start!("same-rate@missing.example") }
          start!("same-rate@missing.example")
        end
        assert_response :too_many_requests
        assert_equal "rate_limited", JSON.parse(response.body)["status"]
      end

      test "mail failure returns 503 and does not leave an unpublished challenge" do
        MailDelivery.stub(
          :safe_deliver_result,
          ->(&_) { { success: false, error: "Mailtrap API HTTP 400", code: "delivery_exception" } }
        ) do
          assert_no_difference -> { PasswordSetupChallenge.count } do
            start!(@user.email)
          end
        end

        assert_response :service_unavailable
        body = JSON.parse(response.body)
        assert_equal "mail_failed", body["status"]
        assert_equal 0, PasswordSetupChallenge.where(user_id: @user.id).count
      end

      test "mail failure deletes a leftover unpublished challenge" do
        leftover = PasswordSetupChallenge.new(user: @user, request_ip: "1.1.1.1")
        leftover.assign_code!("654321")
        leftover.save!

        MailDelivery.stub(
          :safe_deliver_result,
          ->(&_) { { success: false, error: "Mailtrap API HTTP 400", code: "delivery_exception" } }
        ) do
          start!(@user.email)
        end

        assert_response :service_unavailable
        assert_equal 0, PasswordSetupChallenge.where(user_id: @user.id).count
      end

      test "company accounts are not eligible" do
        company = User.create!(
          email: "company-setup@example.com",
          password: "UserPass1!",
          password_confirmation: "UserPass1!",
          role: :company,
          password_set_actor: "user"
        )
        with_mail_and_code { start!(company.email) }
        assert_response :ok
        assert_equal "not_eligible", JSON.parse(response.body)["status"]
      end

      private

      def create_system_tech!(email)
        User.create!(
          email: email,
          password: SYSTEM_PASSWORD,
          password_confirmation: SYSTEM_PASSWORD,
          role: :technician,
          password_set_actor: "system"
        )
      end

      def with_mail_and_code
        MailDelivery.stub(
          :safe_deliver_result,
          ->(&block) { { success: true, value: block.call, code: "ok" } }
        ) do
          PasswordSetupChallenge.stub(:generate_code, CODE) do
            yield
          end
        end
      end

      def start!(email)
        post "/api/v1/auth/password_setup/start", params: { email: email }, as: :json
      end

      def start_challenge!(user)
        with_mail_and_code { start!(user.email) }
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "code_sent", body["status"]
        @challenge_id = body["challenge_id"]
      end

      def verify!(code)
        post "/api/v1/auth/password_setup/verify",
             params: { challenge_id: @challenge_id, code: code },
             as: :json
      end

      def verify_code!(user)
        start_challenge!(user)
        verify!(CODE)
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "verified", body["status"]
        body["verification_token"]
      end

      def complete!(challenge_id:, verification_token:, password:, password_confirmation:)
        post "/api/v1/auth/password_setup/complete",
             params: {
               challenge_id: challenge_id,
               verification_token: verification_token,
               password: password,
               password_confirmation: password_confirmation
             },
             as: :json
      end
    end
  end
end
