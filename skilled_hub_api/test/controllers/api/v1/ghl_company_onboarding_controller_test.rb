# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class GhlCompanyOnboardingControllerTest < ActionDispatch::IntegrationTest
      SECRET = "ghl-test-secret"
      PATH = "/api/v1/webhooks/ghl/company_onboarding"

      setup do
        @previous_secret = ENV["GHL_WEBHOOK_SECRET"]
        ENV["GHL_WEBHOOK_SECRET"] = SECRET
        ActionMailer::Base.deliveries.clear
      end

      teardown do
        ENV["GHL_WEBHOOK_SECRET"] = @previous_secret
      end

      # --- auth -------------------------------------------------------------

      test "missing authorization header returns 401 and creates nothing" do
        assert_no_difference -> { User.count } do
          post PATH, params: valid_payload, as: :json
        end
        assert_response :unauthorized
        assert_equal 0, GhlWebhookEvent.count
      end

      test "wrong secret returns 401" do
        post_company(valid_payload, token: "wrong-secret")
        assert_response :unauthorized
        assert_equal 0, User.where(role: :company).count
      end

      test "unset server secret returns 401" do
        ENV["GHL_WEBHOOK_SECRET"] = nil
        post_company(valid_payload)
        assert_response :unauthorized
      end

      # --- valid new company ------------------------------------------------

      test "valid payload creates company user, profile, and CRM prospect" do
        assert_difference -> { User.where(role: :company).count }, 1 do
          assert_difference -> { CompanyProfile.count }, 1 do
            assert_difference -> { CrmLead.count }, 1 do
              post_company(valid_payload)
            end
          end
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["success"]
        assert_equal true, body["created"]
        assert_equal "gc_001", body["ghl_contact_id"]
        assert_equal "both", body["staffing_intent"]
        assert_equal true, body["password_setup_required"]
        assert_equal "/create-password", body["password_setup_path"]
        assert_nil body["token"]
        refute body.key?("password")

        user = User.find(body["user_id"])
        assert user.company?
        assert_equal "owner@acmehvac.com", user.email
        assert_equal "Dana", user.first_name
        assert_equal "Reyes", user.last_name
        assert_equal "7135550101", user.phone_normalized
        assert_equal "gc_001", user.ghl_contact_id
        assert_equal "loc_001", user.ghl_location_id
        assert user.ghl_onboarded_at.present?

        profile = CompanyProfile.find(body["company_profile_id"])
        assert_equal profile.id, user.company_profile_id
        assert_equal user.id, profile.user_id
        assert_equal "Acme HVAC", profile.company_name
        assert_equal "HVAC Technician", profile.industry
        assert_equal ["HVAC Technician", "Electrician"], profile.service_trades
        assert_equal "77002", profile.business_zip_code
        assert_equal "both", profile.staffing_intent
        assert_equal MembershipPolicy.default_slug_for("company"), profile.membership_level
        assert_equal 3, profile.hiring_context["technicians_needed"]
        assert_equal "Within 2 weeks", profile.hiring_context["hiring_timeframe"]
        assert_equal "journeyman", profile.hiring_context["technician_level"]
        assert_equal "$30-$40/hr", profile.hiring_context["pay_range"]
        assert_equal "meta_lead_123", profile.acquisition_attribution["meta_lead_id"]
        assert_equal "meta", profile.acquisition_attribution["lead_source"]
        assert_equal "gc_001", profile.acquisition_attribution["ghl_contact_id"]

        lead = CrmLead.find(body["crm_lead_id"])
        assert_equal "prospect", lead.status
        assert_equal user.id, lead.linked_user_id
        assert_equal profile.id, lead.linked_company_profile_id
        assert_equal "Acme HVAC", lead.name
        assert_equal "77002", lead.zip
        assert_includes lead.company_types, "hvac"
        assert_includes lead.company_types, "electrical"
        assert_equal 1, lead.crm_notes.count
        assert_match(/Staffing: both/, lead.crm_notes.first.body)

        event = GhlWebhookEvent.find_by!(idempotency_key: "gc_001:form:1")
        assert_equal "company_onboarding", event.event_type
        assert_equal user.id, event.user_id
        assert event.processed_at.present?
        assert_nil event.processing_error
        assert_equal 1, event.attempt_count
      end

      test "no default password: system password is unusable and nothing is emailed" do
        post_company(valid_payload)
        user = User.find(JSON.parse(response.body)["user_id"])

        assert user.password_digest.present?
        assert_equal "system", user.password_set_by
        refute user.authenticate(user.email)
        refute user.authenticate(user.phone.to_s)
        refute user.authenticate(user.phone_normalized.to_s)
        refute user.authenticate("77002")
        refute user.authenticate("Acme HVAC")
        refute user.authenticate("password")
        assert_equal 0, ActionMailer::Base.deliveries.size
      end

      test "missing optional fields still creates the company" do
        post_company(minimal_payload)

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["created"]
        profile = CompanyProfile.find(body["company_profile_id"])
        assert_equal "Minimal Co", profile.company_name
        assert_nil profile.business_zip_code
        assert_nil profile.staffing_intent
        assert_equal [], profile.service_trades
        assert_equal({}, profile.hiring_context)
        assert_equal [], body["warnings"]
      end

      test "missing required keys returns 422 and logs the failed event" do
        post_company(valid_payload.except(:ghl_contact_id, :phone))

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_equal false, body["success"]
        assert_match(/ghl_contact_id/, body["error"])
        assert_match(/phone/, body["error"])
        event = GhlWebhookEvent.find_by!(idempotency_key: "gc_001:form:1")
        assert_nil event.processed_at
        assert_match(/Missing required/, event.processing_error)
      end

      test "new company without email or company_name is rejected" do
        post_company(valid_payload.except(:email, :company_name))

        assert_response :unprocessable_entity
        assert_match(/email and company_name required/, JSON.parse(response.body)["error"])
        assert_equal 0, User.where(role: :company).count
      end

      test "invalid phone is rejected" do
        post_company(valid_payload.merge(phone: "12"))
        assert_response :unprocessable_entity
        assert_equal "phone is invalid", JSON.parse(response.body)["error"]
      end

      # --- idempotency ------------------------------------------------------

      test "replaying the same idempotency_key returns the original result without changes" do
        post_company(valid_payload)
        first = JSON.parse(response.body)

        assert_no_difference [-> { User.count }, -> { CompanyProfile.count }, -> { CrmLead.count }, -> { CrmNote.count }] do
          post_company(valid_payload.merge(company_name: "Renamed On Replay", staffing_type: "temporary"))
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["replayed"]
        assert_equal false, body["created"]
        assert_equal first["user_id"], body["user_id"]
        assert_equal first["company_profile_id"], body["company_profile_id"]
        assert_equal first["crm_lead_id"], body["crm_lead_id"]
        profile = CompanyProfile.find(first["company_profile_id"])
        assert_equal "Acme HVAC", profile.company_name
        assert_equal "both", profile.staffing_intent
        assert_equal 1, GhlWebhookEvent.where(idempotency_key: "gc_001:form:1").count
      end

      test "a failed event is retried on the same key and then succeeds" do
        post_company(valid_payload.merge(phone: "12"))
        assert_response :unprocessable_entity

        post_company(valid_payload)
        assert_response :accepted
        event = GhlWebhookEvent.find_by!(idempotency_key: "gc_001:form:1")
        assert event.processed_at.present?
        assert_nil event.processing_error
        assert_equal 2, event.attempt_count
      end

      test "a new idempotency_key for the same contact updates instead of duplicating" do
        post_company(valid_payload)
        first = JSON.parse(response.body)

        assert_no_difference [-> { User.count }, -> { CompanyProfile.count }, -> { CrmLead.count }] do
          post_company(valid_payload.merge(
            idempotency_key: "gc_001:form:2",
            staffing_type: "Temporary",
            technicians_needed: "5",
            company_name: "Should Not Rename"
          ))
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal false, body["created"]
        assert_equal "ghl_contact_id", body["matched_by"]
        assert_equal first["user_id"], body["user_id"]
        profile = CompanyProfile.find(first["company_profile_id"])
        assert_equal "Acme HVAC", profile.company_name, "existing company name is preserved"
        assert_equal "temporary", profile.staffing_intent, "latest staffing intent wins"
        assert_equal 5, profile.hiring_context["technicians_needed"]
        assert_equal "Within 2 weeks", profile.hiring_context["hiring_timeframe"], "earlier context kept when not resent"
        assert_equal 2, CrmLead.find(first["crm_lead_id"]).crm_notes.count
      end

      test "idempotency_key already used by a technician event is refused" do
        GhlWebhookEvent.create!(idempotency_key: "shared-key", event_type: "technician_onboarding", processed_at: Time.current)

        post_company(valid_payload.merge(idempotency_key: "shared-key"))

        assert_response :conflict
        assert_match(/technician_onboarding/, JSON.parse(response.body)["error"])
        assert_equal 0, User.where(role: :company).count
      end

      # --- duplicates & collisions -----------------------------------------

      test "duplicate email matches the existing company user" do
        existing = create_company!(email: "owner@acmehvac.com", phone: "8325550000", company_name: "Acme Original")

        assert_no_difference [-> { User.count }, -> { CompanyProfile.count }] do
          post_company(valid_payload.merge(email: "OWNER@AcmeHVAC.com"))
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal false, body["created"]
        assert_equal "email", body["matched_by"]
        assert_equal existing.id, body["user_id"]
      end

      test "duplicate normalized phone with no email matches the existing company user" do
        existing = create_company!(email: "office@acmehvac.com", phone: "(713) 555-0101", company_name: "Acme Original")

        assert_no_difference -> { User.count } do
          post_company(valid_payload.except(:email).merge(phone: "+1 713-555-0101"))
        end

        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal existing.id, body["user_id"]
        assert_equal "phone", body["matched_by"]
      end

      test "phone-only match with a different email is a conflict, not a merge" do
        create_company!(email: "office@acmehvac.com", phone: "7135550101", company_name: "Acme Original")

        assert_no_difference -> { User.count } do
          post_company(valid_payload.merge(email: "someone-else@acmehvac.com"))
        end

        assert_response :conflict
        assert_match(/different email/, JSON.parse(response.body)["error"])
      end

      test "email and phone matching two different companies is a conflict" do
        create_company!(email: "owner@acmehvac.com", phone: "8325550000", company_name: "A")
        create_company!(email: "other@example.com", phone: "7135550101", company_name: "B")

        post_company(valid_payload)

        assert_response :conflict
        assert_match(/different TechFlash accounts/, JSON.parse(response.body)["error"])
      end

      test "existing company user keeps email, password, and profile fields" do
        existing = create_company!(email: "owner@acmehvac.com", phone: "7135550101", company_name: "Acme Original", password: "UserChosen1!")
        profile = existing.company_profile
        profile.update_columns(business_zip_code: "78701", service_trades: ["Plumber"])
        digest_before = existing.reload.password_digest

        post_company(valid_payload)

        assert_response :accepted
        existing.reload
        profile.reload
        assert_equal digest_before, existing.password_digest
        assert_equal "user", existing.password_set_by
        assert existing.authenticate("UserChosen1!")
        assert_equal "owner@acmehvac.com", existing.email
        assert_equal "Acme Original", profile.company_name
        assert_equal "78701", profile.business_zip_code
        assert_equal "Austin", profile.location, "a blank location is filled from the ZIP already stored, not the incoming one"
        assert_equal "Texas", profile.state
        assert_equal ["Plumber"], profile.service_trades
        assert_equal "both", profile.staffing_intent
        assert_equal "gc_001", existing.ghl_contact_id
        body = JSON.parse(response.body)
        assert_equal false, body["password_setup_required"], "a user-set password is never replaced by setup"
      end

      test "email matching a technician is a conflict and changes nothing" do
        tech = User.create!(email: "owner@acmehvac.com", password: "TechPass1!", password_confirmation: "TechPass1!", role: :technician)

        assert_no_difference [-> { User.count }, -> { CompanyProfile.count }, -> { CrmLead.count }] do
          post_company(valid_payload)
        end

        assert_response :conflict
        assert_match(/technician account already exists/, JSON.parse(response.body)["error"])
        assert tech.reload.technician?
        assert_nil tech.ghl_contact_id
      end

      test "phone matching an admin is a conflict" do
        User.create!(email: "admin@techflash.test", phone: "7135550101", password: "AdminPass1!", password_confirmation: "AdminPass1!", role: :admin)

        post_company(valid_payload)

        assert_response :conflict
        assert_match(/admin account already exists/, JSON.parse(response.body)["error"])
      end

      test "existing unlinked CRM lead with the same email is adopted, not duplicated" do
        lead = CrmLead.create!(name: "Acme HVAC (imported)", email: "owner@acmehvac.com", status: "contacted")

        assert_no_difference -> { CrmLead.count } do
          post_company(valid_payload)
        end

        lead.reload
        assert_equal "prospect", lead.status, "pre-prospect stages advance to prospect"
        assert_equal JSON.parse(response.body)["user_id"], lead.linked_user_id
      end

      test "CRM lead in a later stage is never downgraded" do
        post_company(valid_payload)
        lead = CrmLead.find(JSON.parse(response.body)["crm_lead_id"])
        lead.update!(status: "customer")

        post_company(valid_payload.merge(idempotency_key: "gc_001:form:2"))

        assert_equal "customer", lead.reload.status
      end

      # --- staffing intent --------------------------------------------------

      {
        "Temporary" => "temporary",
        "temp" => "temporary",
        "Full-Time" => "full_time",
        "full_time" => "full_time",
        "Both" => "both",
        "Temporary / Full-Time" => "both"
      }.each do |raw, expected|
        test "staffing_type #{raw.inspect} is stored as #{expected}" do
          post_company(valid_payload.merge(staffing_type: raw))
          assert_response :accepted
          profile = CompanyProfile.find(JSON.parse(response.body)["company_profile_id"])
          assert_equal expected, profile.staffing_intent
        end
      end

      test "unrecognised staffing_type is kept raw with a warning and does not block onboarding" do
        post_company(valid_payload.merge(staffing_type: "seasonal"))

        assert_response :accepted
        body = JSON.parse(response.body)
        profile = CompanyProfile.find(body["company_profile_id"])
        assert_nil profile.staffing_intent
        assert_equal "seasonal", profile.hiring_context["staffing_type_raw"]
        assert(body["warnings"].any? { |w| w.include?("staffing_type") })
      end

      test "staffing intent never creates a job" do
        assert_no_difference -> { Job.count } do
          post_company(valid_payload.merge(staffing_type: "temporary"))
          post_company(valid_payload.merge(idempotency_key: "gc_001:form:2", staffing_type: "both"))
        end
      end

      # --- business ZIP -----------------------------------------------------

      test "business_zip maps to the company profile city and state, not a job" do
        post_company(valid_payload)
        body = JSON.parse(response.body)
        profile = CompanyProfile.find(body["company_profile_id"])

        assert_equal "77002", profile.business_zip_code
        assert_equal "Houston", profile.location
        assert_equal "Texas", profile.state
        refute_includes profile.location, "77002"
        refute(body["warnings"].any? { |w| w.include?("business_zip") })
        assert_equal 0, Job.where(company_profile_id: profile.id).count
      end

      test "business ZIP does not overwrite an existing location or state" do
        existing = create_company!(email: "owner@acmehvac.com", phone: "7135550101", company_name: "Acme Original")
        existing.company_profile.update_columns(location: "Dallas", state: "Texas")

        post_company(valid_payload)

        profile = existing.company_profile.reload
        assert_equal "77002", profile.business_zip_code
        assert_equal "Dallas", profile.location
        assert_equal "Texas", profile.state
      end

      test "an unrecognized business ZIP is stored and warned, without inventing a city" do
        post_company(valid_payload.merge(business_zip: "00000"))

        assert_response :accepted
        body = JSON.parse(response.body)
        profile = CompanyProfile.find(body["company_profile_id"])
        assert_equal "00000", profile.business_zip_code
        assert_nil profile.location
        assert_nil profile.state
        assert(body["warnings"].any? { |w| w.include?("00000") })
      end

      test "business_zip_code and company_zip aliases are accepted" do
        post_company(valid_payload.except(:business_zip).merge(business_zip_code: "Houston TX 77019"))
        assert_equal "77019", CompanyProfile.find(JSON.parse(response.body)["company_profile_id"]).business_zip_code
      end

      test "generic zip keys are not accepted as business ZIP" do
        post_company(valid_payload.except(:business_zip).merge(zip: "77002", zip_code: "77002", postal_code: "77002"))

        assert_response :accepted
        profile = CompanyProfile.find(JSON.parse(response.body)["company_profile_id"])
        assert_nil profile.business_zip_code
        assert_nil profile.location
        assert_nil profile.state
      end

      private

      def post_company(payload, token: SECRET)
        headers = {}
        headers["Authorization"] = "Bearer #{token}" if token
        post PATH, params: payload, headers: headers, as: :json
      end

      def valid_payload
        {
          idempotency_key: "gc_001:form:1",
          ghl_contact_id: "gc_001",
          ghl_location_id: "loc_001",
          first_name: "Dana",
          last_name: "Reyes",
          company_name: "Acme HVAC",
          email: "owner@acmehvac.com",
          phone: "+17135550101",
          business_zip: "77002",
          primary_trade: "HVAC",
          trades_needed: "Electrician",
          staffing_type: "Both",
          technicians_needed: "3",
          hiring_timeframe: "Within 2 weeks",
          technician_level: "Journeyman",
          pay_range: "$30-$40/hr",
          lead_source: "meta",
          meta_lead_id: "meta_lead_123",
          meta_form_id: "form_9"
        }
      end

      def minimal_payload
        {
          idempotency_key: "gc_min:1",
          ghl_contact_id: "gc_min",
          ghl_location_id: "loc_001",
          company_name: "Minimal Co",
          email: "min@example.com",
          phone: "7135550199"
        }
      end

      def create_company!(email:, phone:, company_name:, password: "CompanyPass1!")
        user = User.create!(email: email, phone: phone, password: password, password_confirmation: password, role: :company)
        profile = CompanyProfile.create!(user: user, company_name: company_name, phone: phone, membership_level: MembershipPolicy.default_slug_for("company"))
        user.update_column(:company_profile_id, profile.id)
        user.reload
      end
    end
  end
end
