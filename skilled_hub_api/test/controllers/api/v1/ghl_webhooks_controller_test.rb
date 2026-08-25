# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class GhlWebhooksControllerTest < ActionDispatch::IntegrationTest
      SECRET = "ghl-test-secret"

      setup do
        @previous_secret = ENV["GHL_WEBHOOK_SECRET"]
        ENV["GHL_WEBHOOK_SECRET"] = SECRET
        ActionMailer::Base.deliveries.clear
      end

      teardown do
        ENV["GHL_WEBHOOK_SECRET"] = @previous_secret
      end

      test "missing secret header returns 401" do
        post "/api/v1/webhooks/ghl/technician_onboarding",
             params: valid_payload,
             as: :json

        assert_response :unauthorized
        assert_equal 0, User.where(ghl_contact_id: "abc123").count
      end

      test "wrong secret returns 401" do
        post_ghl(valid_payload, token: "wrong-secret")
        assert_response :unauthorized
      end

      test "missing env secret returns 401" do
        ENV["GHL_WEBHOOK_SECRET"] = nil
        post_ghl(valid_payload)
        assert_response :unauthorized
      end

      test "correct secret creates pending technician without jwt or mail" do
        assert_difference -> { User.where(role: :technician).count }, 1 do
          post_ghl(valid_payload)
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["success"]
        assert_equal true, body["created"]
        assert_equal "abc123", body["ghl_contact_id"]
        assert body["user_id"].present?
        assert body["technician_profile_id"].present?
        assert_nil body["token"]
        refute body.key?("password")

        user = User.find(body["user_id"])
        profile = user.technician_profile
        assert_equal "tech@example.com", user.email
        assert_equal "+17135551234", user.phone
        assert_equal "7135551234", user.phone_normalized
        assert_equal "John", user.first_name
        assert_equal "Smith", user.last_name
        assert_equal "abc123", user.ghl_contact_id
        assert_equal "loc123", user.ghl_location_id
        assert_equal "conv123", user.ghl_conversation_id
        assert user.ghl_onboarded_at.present?
        assert user.password_digest.present?
        assert_equal "system", user.password_set_by
        assert profile.present?
        assert_equal false, profile.background_verified
        assert_equal "77002", profile.zip_code
        assert_equal 0, ActionMailer::Base.deliveries.size
        assert_equal 3, user.verification_references_as_technician.count
        assert user.verification_references_as_technician.all? { |ref| ref.requested? }
        assert_nil VerificationProfile.find_by(user_id: user.id)
      end

      test "creates technician when names are blank" do
        post_ghl(valid_payload.merge(first_name: "", last_name: "", idempotency_key: "blank-names", ghl_contact_id: "blank-names"))

        assert_response :accepted
        user = User.find(JSON.parse(response.body)["user_id"])
        assert_nil user.first_name.presence
        assert_nil user.last_name.presence
      end

      test "parses email and zip from grouped contact info" do
        post_ghl(
          valid_payload.merge(
            ghl_contact_id: "parse-email",
            idempotency_key: "parse-email",
            email: "",
            tf_intake_contact_info: "Email: parsed@example.com\nZIP: 75201"
          )
        )

        assert_response :accepted
        user = User.find(JSON.parse(response.body)["user_id"])
        assert_equal "parsed@example.com", user.email
        assert_equal "75201", user.technician_profile.zip_code
      end

      test "same idempotency key does not create a duplicate user" do
        post_ghl(valid_payload)
        assert_response :accepted
        first = JSON.parse(response.body)

        assert_no_difference -> { User.count } do
          post_ghl(valid_payload)
        end

        assert_response :ok
        replay = JSON.parse(response.body)
        assert_equal first["user_id"], replay["user_id"]
        assert_equal false, replay["created"]
        assert_equal 3, User.find(first["user_id"]).verification_references_as_technician.count
      end

      test "matches existing technician by ghl_contact_id" do
        post_ghl(valid_payload)
        user_id = JSON.parse(response.body)["user_id"]

        post_ghl(
          valid_payload.merge(
            idempotency_key: "second-key",
            email: "updated-ghl@example.com",
            first_name: "Jonathan"
          )
        )

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal user_id, body["user_id"]
        assert_equal false, body["created"]
        user = User.find(user_id)
        assert_equal "updated-ghl@example.com", user.email
        assert_equal "Jonathan", user.first_name
      end

      test "matches existing technician by email" do
        existing = create_technician!(email: "match-email@example.com", phone: "7135559999")

        post_ghl(
          valid_payload.merge(
            ghl_contact_id: "email-match",
            idempotency_key: "email-match",
            email: "match-email@example.com",
            phone: "+17135550000"
          )
        )

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal existing.id, body["user_id"]
        assert_equal false, body["created"]
        assert_equal "email-match", existing.reload.ghl_contact_id
      end

      test "matches existing technician by normalized phone" do
        existing = create_technician!(email: "phone-match@example.com", phone: "(713) 555-1234")

        post_ghl(
          valid_payload.merge(
            ghl_contact_id: "phone-match",
            idempotency_key: "phone-match",
            email: "phone-match-new@example.com",
            phone: "+17135551234"
          )
        )

        assert_response :accepted
        assert_equal existing.id, JSON.parse(response.body)["user_id"]
        assert_equal "phone-match", existing.reload.ghl_contact_id
      end

      test "company account email collision returns 409" do
        User.create!(
          email: "company-collide@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company,
          phone: "7135550001"
        )

        post_ghl(valid_payload.merge(email: "company-collide@example.com", ghl_contact_id: "co-collide", idempotency_key: "co-collide"))
        assert_response :conflict
        assert_equal 0, User.where(ghl_contact_id: "co-collide").count
      end

      test "email and phone pointing at different technicians returns 409" do
        create_technician!(email: "left@example.com", phone: "7135551001")
        create_technician!(email: "right@example.com", phone: "7135551002")

        post_ghl(
          valid_payload.merge(
            ghl_contact_id: "split-match",
            idempotency_key: "split-match",
            email: "left@example.com",
            phone: "7135551002"
          )
        )

        assert_response :conflict
      end

      test "blank inbound values do not erase existing user data" do
        post_ghl(valid_payload)
        user = User.find(JSON.parse(response.body)["user_id"])

        post_ghl(
          valid_payload.merge(
            idempotency_key: "blank-update",
            first_name: "",
            last_name: "",
            email: "tech@example.com",
            tf_intake_contact_info: "tech@example.com",
            tf_intake_references: ""
          )
        )

        assert_response :accepted
        user.reload
        assert_equal "John", user.first_name
        assert_equal "Smith", user.last_name
        assert_equal "77002", user.technician_profile.zip_code
        assert_equal 3, user.verification_references_as_technician.count
      end

      test "missing email returns 422 and records processing error" do
        post_ghl(
          valid_payload.merge(
            ghl_contact_id: "no-email",
            idempotency_key: "no-email",
            email: "",
            tf_intake_contact_info: "ZIP: 77002"
          )
        )

        assert_response :unprocessable_entity
        event = GhlWebhookEvent.find_by(idempotency_key: "no-email")
        assert event.present?
        assert_nil event.processed_at
        assert_match(/email is required/i, event.processing_error)
      end

      private

      def post_ghl(payload, token: SECRET)
        headers = {}
        headers["Authorization"] = "Bearer #{token}" if token
        post "/api/v1/webhooks/ghl/technician_onboarding",
             params: payload,
             headers: headers,
             as: :json
      end

      def valid_payload
        {
          ghl_contact_id: "abc123",
          ghl_location_id: "loc123",
          ghl_conversation_id: "conv123",
          idempotency_key: "abc123",
          phone: "+17135551234",
          email: "tech@example.com",
          first_name: "John",
          last_name: "Smith",
          tf_intake_contact_info: "tech@example.com / 77002",
          tf_intake_references: "1. Sam Jones, 7135551111, ABC Plumbing, supervisor; 2. Mike Lee, 7135552222; 3. Chris Brown, 7135553333, coworker"
        }
      end

      def create_technician!(email:, phone:)
        user = User.create!(
          email: email,
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          phone: phone,
          first_name: "Existing",
          last_name: "Tech"
        )
        TechnicianProfile.create!(user: user, membership_level: "basic", phone: phone)
        user
      end
    end
  end
end
