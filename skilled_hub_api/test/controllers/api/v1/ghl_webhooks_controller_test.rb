# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class GhlWebhooksControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

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
        refute user.authenticate(user.email)
        refute user.authenticate(user.phone.to_s)
        assert profile.present?
        assert_equal false, profile.background_verified
        assert_equal "77002", profile.zip_code
        assert_equal "United States", profile.country
        assert_equal 0, ActionMailer::Base.deliveries.size
        assert_equal 3, user.verification_references_as_technician.count
        assert user.verification_references_as_technician.all? { |ref| ref.requested? }
        assert_nil VerificationProfile.find_by(user_id: user.id)
      end

      test "zip only from ghl is geocoded to a map pin without a street address" do
        GeocodingService.stub(:geocode, ->(**kwargs) {
          assert_equal "77002", kwargs[:zip_code]
          assert kwargs[:address].blank?
          [29.7604, -95.3698]
        }) do
          post_ghl(valid_payload.merge(idempotency_key: "ghl-zip-map", ghl_contact_id: "ghl-zip-map"))
        end

        assert_response :accepted
        profile = User.find(JSON.parse(response.body)["user_id"]).technician_profile
        assert_equal "77002", profile.zip_code
        assert_equal "", profile.address.to_s
        assert_equal "United States", profile.country
        assert_in_delta 29.7604, profile.latitude, 0.0001
        assert_in_delta(-95.3698, profile.longitude, 0.0001)
        assert_equal "success", profile.geocode_status
        assert profile.map_ready?
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

      test "meta lead payload creates technician from structured fields without intake blobs" do
        assert_difference -> { User.where(role: :technician).count }, 1 do
          post_ghl(meta_lead_payload)
        end

        assert_response :accepted
        user = User.find(JSON.parse(response.body)["user_id"])
        assert_equal "lead@example.com", user.email
        assert_equal "Jordan", user.first_name
        assert_equal "Lee", user.last_name
        assert_equal "77002", user.technician_profile.zip_code
        assert_equal "system", user.password_set_by
        refute user.authenticate(user.email)
        assert_equal 0, user.verification_references_as_technician.count
      end

      test "progressive trade pay and one reference update the same technician" do
        post_ghl(meta_lead_payload)
        user_id = JSON.parse(response.body)["user_id"]
        digest = User.find(user_id).password_digest

        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-trade",
            event: "trade",
            primary_trade: "HVAC Technician",
            years_of_experience: "8 years",
            technician_level: "Journeyman",
            has_trade_credential: "Yes"
          )
        )

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal user_id, body["user_id"]
        assert_equal false, body["created"]

        user = User.find(user_id)
        profile = user.technician_profile
        assert_equal "HVAC Technician", profile.trade_type
        assert_equal "journeyman", profile.skill_class
        assert_equal 8, profile.experience_years
        assert_equal "HVAC Technician", user.job_alert_preference.trade_label
        assert_equal 1, profile.documents.where(doc_type: %w[license certificate cert]).count
        license = profile.documents.where(doc_type: %w[license certificate cert]).first
        assert_equal "Trade license", license.issuer
        assert_nil license.document_number
        assert license.pending_review?
        refute license.file.attached?
        assert_equal digest, user.password_digest

        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-pay",
            event: "pay_travel",
            minimum_hourly_rate: "$45",
            travel_distance: "50 miles"
          )
        )

        assert_response :accepted
        pref = user.reload.job_alert_preference
        assert_equal 4_500, pref.min_hourly_rate_cents
        assert_equal 50, pref.max_distance_miles
        assert_equal digest, user.password_digest

        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-refs",
            event: "references",
            reference_1_name: "Sam Jones",
            reference_1_company: "ABC Plumbing",
            reference_1_phone: "7135551111",
            reference_1_email: "sam@example.com"
          )
        )

        assert_response :accepted
        refs = user.reload.verification_references_as_technician
        assert_equal 1, refs.count
        ref = refs.first
        assert_equal "Sam Jones", ref.full_name
        assert_equal "ABC Plumbing", ref.company_name
        assert_equal "sam@example.com", ref.email
        assert_equal 1, User.where(email: "lead@example.com").count
        assert_equal digest, user.password_digest
      end

      test "deleted technician is recreated when the same idempotency key is replayed" do
        post_ghl(meta_lead_payload)
        user = User.find(JSON.parse(response.body)["user_id"])
        user.destroy!

        assert_difference -> { User.where(email: "lead@example.com").count }, 1 do
          post_ghl(meta_lead_payload)
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["created"]
        created = User.find(body["user_id"])
        assert_equal "lead@example.com", created.email
        assert_equal "system", created.password_set_by
      end

      test "create-password start works for a ghl-created technician" do
        post_ghl(meta_lead_payload)
        assert_response :accepted
        email = "lead@example.com"

        MailDelivery.stub(
          :safe_deliver_result,
          ->(&block) { { success: true, value: block.call, code: "ok" } }
        ) do
          PasswordSetupChallenge.stub(:generate_code, "123456") do
            post "/api/v1/auth/password_setup/start", params: { email: email }, as: :json
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "code_sent", body["status"]
        assert_equal 1, User.where(email: email).count
      end

      test "blank trade and pay values do not erase previously saved profile data" do
        post_ghl(meta_lead_payload)
        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-trade",
            primary_trade: "Plumber",
            years_of_experience: "4",
            technician_level: "Apprentice",
            minimum_hourly_rate: "40",
            travel_distance: "25"
          )
        )
        user = User.find_by!(email: "lead@example.com")

        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-blank",
            primary_trade: "",
            years_of_experience: "",
            technician_level: "",
            has_trade_credential: "",
            minimum_hourly_rate: "",
            travel_distance: "",
            zip_code: ""
          )
        )

        assert_response :accepted
        profile = user.reload.technician_profile
        pref = user.job_alert_preference
        assert_equal "Plumber", profile.trade_type
        assert_equal "apprentice", profile.skill_class
        assert_equal 4, profile.experience_years
        assert_equal "77002", profile.zip_code
        assert_equal 4_000, pref.min_hourly_rate_cents
        assert_equal 25, pref.max_distance_miles
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

      test "profile_photo event downloads and attaches avatar for existing technician" do
        post_ghl(meta_lead_payload)
        user = User.find(JSON.parse(response.body)["user_id"])
        digest = user.password_digest
        profile = user.technician_profile
        refute profile.avatar.attached?

        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["photo_updated"]
        assert_equal user.id, body["user_id"]
        assert_equal false, body["created"]
        profile.reload
        assert profile.avatar.attached?
        assert_equal "image/png", profile.avatar.content_type
        blob = profile.avatar.blob
        assert blob.service.exist?(blob.key)
        assert_equal MINI_PNG, blob.service.download(blob.key)
        assert_equal digest, user.reload.password_digest
        assert_equal "77002", profile.zip_code
      end

      test "profile_photo retry with the same idempotency key does not duplicate attachments" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
          assert_response :accepted
          post_ghl(profile_photo_payload)
        end

        assert_response :ok
        user = User.find_by!(email: "lead@example.com")
        assert user.technician_profile.avatar.attached?
        assert_equal 1, ActiveStorage::Attachment.where(record: user.technician_profile, name: "avatar").count
      end

      test "new profile_photo event replaces the previous avatar" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch(filename: "first.png") do
          post_ghl(profile_photo_payload)
        end
        profile = User.find_by!(email: "lead@example.com").technician_profile
        first_blob_id = profile.avatar.blob.id

        stub_ghl_image_fetch(filename: "second.png") do
          post_ghl(profile_photo_payload.merge(idempotency_key: "contact-lead-profile-photo-2"))
        end

        assert_response :accepted
        profile.reload
        assert profile.avatar.attached?
        assert_equal "second.png", profile.avatar.filename.to_s
        refute_equal first_blob_id, profile.avatar.blob.id
        assert_equal 1, ActiveStorage::Attachment.where(record: profile, name: "avatar").count
      end

      test "blank profile photo does not erase an existing avatar" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
        end
        profile = User.find_by!(email: "lead@example.com").technician_profile
        assert profile.avatar.attached?

        post_ghl(
          profile_photo_payload.merge(
            idempotency_key: "contact-lead-profile-photo-blank",
            profile_photo_url: ""
          )
        )

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal false, body["photo_updated"]
        assert profile.reload.avatar.attached?
      end

      test "non-image profile photo is rejected without damaging existing avatar" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
        end
        profile = User.find_by!(email: "lead@example.com").technician_profile
        blob_id = profile.avatar.blob.id

        GhlRemoteImageFetcher.stub(
          :fetch,
          ->(*) { raise GhlRemoteImageFetcher::Error, "file is not an allowed image type" }
        ) do
          post_ghl(profile_photo_payload.merge(idempotency_key: "contact-lead-profile-photo-html"))
        end

        assert_response :unprocessable_entity
        assert_equal blob_id, profile.reload.avatar.blob.id
      end

      test "oversized profile photo is rejected without damaging existing avatar" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
        end
        profile = User.find_by!(email: "lead@example.com").technician_profile
        blob_id = profile.avatar.blob.id

        GhlRemoteImageFetcher.stub(
          :fetch,
          ->(*) { raise GhlRemoteImageFetcher::Error, "image is too large" }
        ) do
          post_ghl(profile_photo_payload.merge(idempotency_key: "contact-lead-profile-photo-huge"))
        end

        assert_response :unprocessable_entity
        assert_equal blob_id, profile.reload.avatar.blob.id
      end

      test "expired GHL media URL fails without damaging existing avatar or password" do
        post_ghl(meta_lead_payload)
        user = User.find_by!(email: "lead@example.com")
        digest = user.password_digest
        stub_ghl_image_fetch do
          post_ghl(profile_photo_payload)
        end
        blob_id = user.technician_profile.avatar.blob.id

        GhlRemoteImageFetcher.stub(
          :fetch,
          ->(*) { raise GhlRemoteImageFetcher::Error, "could not download image (HTTP 403)" }
        ) do
          post_ghl(profile_photo_payload.merge(idempotency_key: "contact-lead-profile-photo-expired"))
        end

        assert_response :unprocessable_entity
        assert_equal blob_id, user.technician_profile.reload.avatar.blob.id
        assert_equal digest, user.reload.password_digest
      end

      test "profile_photo event does not create a technician when none exists" do
        assert_no_difference -> { User.count } do
          post_ghl(profile_photo_payload.merge(ghl_contact_id: "missing-tech", email: "missing-photo@example.com"))
        end

        assert_response :unprocessable_entity
        assert_match(/technician not found/i, JSON.parse(response.body)["error"])
      end

      test "trade license webhook stores title number and image url on the canonical document" do
        post_ghl(meta_lead_payload)
        user = User.find(JSON.parse(response.body)["user_id"])
        digest = user.password_digest

        stub_ghl_image_fetch(filename: "trade-license.png") do
          post_ghl(
            identity_payload.merge(
              idempotency_key: "contact-lead-trade-license",
              event: "trade_license",
              has_trade_credential: "Yes",
              trade_license_title: "Texas Journeyman Electrician",
              trade_license_number: "123456",
              trade_license_photo_url: "https://services.msgsndr.com/mms/trade-license.png"
            )
          )
        end

        assert_response :accepted
        profile = user.technician_profile
        docs = profile.documents.where(doc_type: %w[license certificate cert])
        assert_equal 1, docs.count
        doc = docs.first
        assert_equal "Texas Journeyman Electrician", doc.issuer
        assert_equal "123456", doc.document_number
        assert doc.pending_review?
        refute doc.approved?
        assert doc.file.attached?
        assert_equal "image/png", doc.file.content_type
        assert_equal "trade-license.png", doc.file.filename.to_s
        assert_equal MINI_PNG, doc.file.blob.service.download(doc.file.blob.key)
        assert_equal "ghl_intake", doc.metadata["source"]
        assert_equal digest, user.reload.password_digest

        get "/api/v1/documents", headers: auth_header_for(user)
        assert_response :ok
        listed = JSON.parse(response.body)
        listed = listed["documents"] if listed.is_a?(Hash)
        match = listed.find { |row| row["id"] == doc.id }
        assert match.present?
        assert match["file_url"].present?
        assert_includes match["file_url"], "/rails/active_storage/"
        assert_equal "Texas Journeyman Electrician", match["issuer"]
        assert_equal "123456", match["document_number"]
        assert_equal "pending_review", match["status"]
      end

      test "later trade license photo updates the ghl placeholder without duplicating" do
        post_ghl(meta_lead_payload)
        post_ghl(
          identity_payload.merge(
            idempotency_key: "contact-lead-trade",
            event: "trade",
            has_trade_credential: "Yes"
          )
        )
        profile = User.find_by!(email: "lead@example.com").technician_profile
        placeholder = profile.documents.where(doc_type: %w[license certificate cert]).first
        assert placeholder.present?
        refute placeholder.file.attached?

        stub_ghl_image_fetch(filename: "trade-license.png") do
          post_ghl(
            identity_payload.merge(
              idempotency_key: "contact-lead-trade-license-photo",
              event: "trade_license",
              trade_license_title: "Texas Journeyman Electrician",
              trade_license_number: "123456",
              trade_license_photo_url: "https://services.msgsndr.com/mms/trade-license.png"
            )
          )
        end

        assert_response :accepted
        docs = profile.reload.documents.where(doc_type: %w[license certificate cert])
        assert_equal 1, docs.count
        doc = docs.first
        assert_equal placeholder.id, doc.id
        assert_equal "Texas Journeyman Electrician", doc.issuer
        assert_equal "123456", doc.document_number
        assert doc.file.attached?
        assert doc.pending_review?
      end

      test "failed trade license photo does not destroy an existing attached license or avatar" do
        post_ghl(meta_lead_payload)
        stub_ghl_image_fetch(filename: "avatar.png") do
          post_ghl(profile_photo_payload)
        end
        stub_ghl_image_fetch(filename: "trade-license.png") do
          post_ghl(
            identity_payload.merge(
              idempotency_key: "contact-lead-trade-license",
              event: "trade_license",
              trade_license_title: "Texas Journeyman Electrician",
              trade_license_number: "123456",
              trade_license_photo_url: "https://services.msgsndr.com/mms/trade-license.png"
            )
          )
        end
        profile = User.find_by!(email: "lead@example.com").technician_profile
        avatar_blob_id = profile.avatar.blob.id
        license = profile.documents.where(doc_type: %w[license certificate cert]).first
        license_blob_id = license.file.blob.id

        GhlRemoteImageFetcher.stub(
          :fetch,
          ->(*) { raise GhlRemoteImageFetcher::Error, "file is not an allowed image type" }
        ) do
          post_ghl(
            identity_payload.merge(
              idempotency_key: "contact-lead-trade-license-bad",
              event: "trade_license",
              trade_license_title: "Should not replace",
              trade_license_number: "000",
              trade_license_photo_url: "https://services.msgsndr.com/mms/bad.bin"
            )
          )
        end

        assert_response :unprocessable_entity
        profile.reload
        assert_equal avatar_blob_id, profile.avatar.blob.id
        license.reload
        assert_equal license_blob_id, license.file.blob.id
        assert_equal "Texas Journeyman Electrician", license.issuer
        assert_equal "123456", license.document_number
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

      def identity_payload
        {
          ghl_contact_id: "contact-lead",
          ghl_location_id: "loc-lead",
          ghl_conversation_id: "conv-lead",
          phone: "+17135557777",
          email: "lead@example.com",
          first_name: "Jordan",
          last_name: "Lee",
          zip_code: "77002"
        }
      end

      def meta_lead_payload
        identity_payload.merge(
          idempotency_key: "contact-lead-meta",
          event: "meta_lead",
          full_name: "Jordan Lee"
        )
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

      def profile_photo_payload
        identity_payload.merge(
          idempotency_key: "contact-lead-profile-photo",
          event: "profile_photo",
          profile_photo_url: "https://services.msgsndr.com/mms/photo.png"
        )
      end

      MINI_PNG = Base64.decode64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
      ).b

      def stub_ghl_image_fetch(filename: "photo.png")
        GhlRemoteImageFetcher.stub(:fetch, lambda { |_url|
          GhlRemoteImageFetcher::Result.new(
            io: StringIO.new(MINI_PNG),
            content_type: "image/png",
            filename: filename,
            bytesize: MINI_PNG.bytesize
          )
        }) { yield }
      end
    end
  end
end
