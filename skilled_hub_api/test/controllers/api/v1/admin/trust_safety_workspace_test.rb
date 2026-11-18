require "test_helper"

module Api
  module V1
    module Admin
      # Covers the redesigned Trust & Safety workspace endpoints and the safety rules
      # enforced on review actions.
      class TrustSafetyWorkspaceTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(email: "ts-admin@example.com", password: "password123", password_confirmation: "password123", role: :admin, first_name: "Ada", last_name: "Admin")
          @tech = create_technician(email: "maria.lopez@example.com", first: "Maria", last: "Lopez", trade: "HVAC", city: "Austin", state: "TX")
          @other_tech = create_technician(email: "sam.ortiz@example.com", first: "Sam", last: "Ortiz", trade: "Electrical", city: "Denver", state: "CO")
        end

        def expected_at(record)
          record.reload.updated_at.iso8601(6)
        end


        # --- Auth -------------------------------------------------------------------------

        test "workspace endpoints require admin auth" do
          %w[summary queue technicians audit].each do |path|
            get "/api/v1/admin/trust_safety/#{path}"
            assert_response :unauthorized, path
            get "/api/v1/admin/trust_safety/#{path}", headers: auth_header_for(@tech)
            assert_response :forbidden, path
          end

          doc = pending_document(@tech)
          get "/api/v1/admin/trust_safety/documents/#{doc.id}/file", headers: auth_header_for(@tech)
          assert_response :forbidden
          get "/api/v1/admin/trust_safety/items/document/#{doc.id}"
          assert_response :unauthorized
          post "/api/v1/admin/trust_safety/items/document/#{doc.id}/notes", params: { note: "x" }, headers: auth_header_for(@other_tech), as: :json
          assert_response :forbidden
        end

        test "invalid token is rejected" do
          get "/api/v1/admin/trust_safety/summary", headers: { "Authorization" => "Bearer not-a-token" }
          assert_response :unauthorized
        end

        # --- Summary / queue -----------------------------------------------------------------

        test "summary counts reflect real pending work and link to queue filters" do
          pending_document(@tech)
          responded_reference(@tech)
          consider_check(@other_tech)
          BackgroundCheck.create!(user: @tech, provider: "checkr", status: :invited, normalized_status: "invitation_sent", paid_by: "technician")

          get "/api/v1/admin/trust_safety/summary", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 3, body.dig("needs_review", "value")
          assert_equal 1, body.dig("credentials_awaiting_review", "value")
          assert_equal 1, body.dig("references_awaiting_review", "value")
          assert_equal 1, body.dig("background_checks_pending", "value")
          assert_equal 1, body.dig("flagged", "breakdown", "background_checks")
          assert_equal "needs_review", body.dig("needs_review", "filter", "status")
        end

        test "queue shows technician names, links and item metadata instead of bare ids" do
          doc = pending_document(@tech)
          get "/api/v1/admin/trust_safety/queue", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          item = body["items"].find { |row| row["key"] == "document:#{doc.id}" }
          assert item, "document should be in the needs_review queue"
          tech = item["technician"]
          assert_equal "Maria Lopez", tech["display_name"]
          assert_equal "ML", tech["initials"]
          assert_equal "/admin/users/#{@tech.id}", tech["admin_user_path"]
          assert_equal "HVAC Technician", tech["trade"]
          assert_equal "Austin, TX", tech["location_label"]
          assert_equal @tech.id, tech["user_id"]
          assert_equal @tech.technician_profile.id, tech["technician_profile_id"]
          assert_equal "Trade License", item["review_type_label"]
          assert_equal "Awaiting Review", item.dig("status", "label")
          assert item["actions"].any? { |a| a["key"] == "approve" }
          assert item["actions"].any? { |a| a["key"] == "reject" && a["requires_reason"] }
        end

        test "queue search, review type, status filters, sorting and pagination" do
          doc = pending_document(@tech)
          ref = responded_reference(@other_tech)
          approved_doc = pending_document(@other_tech, doc_type: "certificate")
          approved_doc.update!(status: :approved, reviewed_by_user: @admin, reviewed_at: Time.current)

          get "/api/v1/admin/trust_safety/queue", params: { q: "lopez" }, headers: auth_header_for(@admin)
          keys = JSON.parse(response.body)["items"].map { |r| r["key"] }
          assert_includes keys, "document:#{doc.id}"
          refute_includes keys, "reference:#{ref.id}"

          get "/api/v1/admin/trust_safety/queue", params: { q: "sam.ortiz@example.com" }, headers: auth_header_for(@admin)
          keys = JSON.parse(response.body)["items"].map { |r| r["key"] }
          assert_equal ["reference:#{ref.id}"], keys

          get "/api/v1/admin/trust_safety/queue", params: { review_type: "reference" }, headers: auth_header_for(@admin)
          assert_equal ["reference:#{ref.id}"], JSON.parse(response.body)["items"].map { |r| r["key"] }

          get "/api/v1/admin/trust_safety/queue", params: { status: "approved", review_type: "credential" }, headers: auth_header_for(@admin)
          assert_equal ["document:#{approved_doc.id}"], JSON.parse(response.body)["items"].map { |r| r["key"] }

          get "/api/v1/admin/trust_safety/queue", params: { trade: "electrician", status: "all" }, headers: auth_header_for(@admin)
          keys = JSON.parse(response.body)["items"].map { |r| r["key"] }
          refute_includes keys, "document:#{doc.id}"
          assert_includes keys, "reference:#{ref.id}"

          get "/api/v1/admin/trust_safety/queue", params: { state: "Texas", status: "all" }, headers: auth_header_for(@admin)
          assert_equal ["document:#{doc.id}"], JSON.parse(response.body)["items"].map { |r| r["key"] }

          doc.update_columns(created_at: 10.days.ago)
          get "/api/v1/admin/trust_safety/queue", params: { sort: "oldest", status: "all" }, headers: auth_header_for(@admin)
          assert_equal "document:#{doc.id}", JSON.parse(response.body)["items"].first["key"]
          get "/api/v1/admin/trust_safety/queue", params: { sort: "newest", status: "all" }, headers: auth_header_for(@admin)
          refute_equal "document:#{doc.id}", JSON.parse(response.body)["items"].first["key"]

          get "/api/v1/admin/trust_safety/queue", params: { status: "all", per_page: 1, page: 2 }, headers: auth_header_for(@admin)
          body = JSON.parse(response.body)
          assert_equal 1, body["items"].size
          assert_equal 3, body.dig("pagination", "total")
          assert_equal 3, body.dig("pagination", "total_pages")
          assert_equal 2, body.dig("pagination", "page")
        end

        test "technicians directory aggregates verification state" do
          pending_document(@tech)
          get "/api/v1/admin/trust_safety/technicians", params: { q: "maria" }, headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 1, body["technicians"].size
          row = body["technicians"].first
          assert_equal "Maria Lopez", row.dig("technician", "display_name")
          assert_equal 1, row.dig("credentials", "pending")
          assert row["needs_review"]
          assert_nil row["background_check"]
        end

        test "trust profile checklist reflects actual records and does not infer identity from a clear check" do
          check = clear_check(@tech)
          @tech.technician_profile.update!(background_verified: true)
          pending_document(@tech)

          get "/api/v1/admin/trust_safety/technicians/#{@tech.id}", headers: auth_header_for(@admin)
          assert_response :ok
          profile = JSON.parse(response.body)["trust_profile"]
          rows = profile["checklist"].index_by { |r| r["key"] }
          assert_equal "verified", rows["background_check"]["status"]
          assert_equal "background_check:#{check.id}", rows["background_check"]["item_ref"]
          assert_equal "needs_review", rows["trade_license"]["status"]
          assert_nil rows["identity"], "identity is no longer part of the verification checklist"
          assert_nil rows["insurance"], "insurance is no longer part of the verification checklist"
          assert_equal "not_started", rows["references"]["status"]
          assert_includes rows.keys, "contact"
          assert_equal 4, profile.dig("summary", "total")
          assert_equal 1, profile.dig("summary", "verified_count")
          assert_equal false, profile.dig("summary", "complete")

          get "/api/v1/admin/trust_safety/technicians/#{@admin.id}", headers: auth_header_for(@admin)
          assert_response :unprocessable_entity
          get "/api/v1/admin/trust_safety/technicians/999999", headers: auth_header_for(@admin)
          assert_response :not_found
        end

        test "trust profile lists each reference so admins can open notes and contact attempts" do
          requested = VerificationReference.create!(
            technician_user: @tech,
            full_name: "Dana Ref",
            email: "dana@example.com",
            relationship: "Supervisor",
            status: :requested,
            requested_at: 1.day.ago
          )

          get "/api/v1/admin/trust_safety/technicians/#{@tech.id}", headers: auth_header_for(@admin)
          assert_response :ok
          refs_row = JSON.parse(response.body).dig("trust_profile", "checklist").find { |r| r["key"] == "references" }
          assert_equal "pending", refs_row["status"]
          assert_equal "reference:#{requested.id}", refs_row["item_ref"]
          assert_equal 1, refs_row["references"].size
          assert_equal "Dana Ref", refs_row["references"].first["title"]
          assert_match(/contact attempt|internal note/i, refs_row["next_action"])

          get "/api/v1/admin/trust_safety/items/reference/#{requested.id}", headers: auth_header_for(@admin)
          assert_response :ok
          actions = JSON.parse(response.body).dig("item", "actions").map { |a| a["key"] }
          assert_includes actions, "note"
          assert_includes actions, "contact_attempt"

          post "/api/v1/admin/trust_safety/items/reference/#{requested.id}/notes",
               params: { note: "Spoke with Dana by phone; confirmed employment 2019-2023." },
               headers: auth_header_for(@admin),
               as: :json
          assert_response :created
          assert_equal "reviewer_note", JSON.parse(response.body).dig("event", "action")
        end

        # --- Documents -------------------------------------------------------------------------

        test "document detail returns short-lived file access and item detail" do
          doc = pending_document(@tech, with_file: true)
          get "/api/v1/admin/trust_safety/items/document/#{doc.id}", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "Maria Lopez", body.dig("item", "technician", "display_name")
          assert body.dig("item", "file", "available")
          assert body.dig("item", "file", "url").present?
          assert body.dig("item", "file", "expires_at").present?
          assert_equal "image", body.dig("item", "file", "kind")
          assert_equal "TX-12345", body.dig("item", "details", "document_number")
          assert_equal ["document_accessed"], body["audit"].map { |row| row["action"] }

          get "/api/v1/admin/trust_safety/documents/#{doc.id}/file", headers: auth_header_for(@admin)
          assert_response :ok
          file = JSON.parse(response.body)["file"]
          assert file["available"]
          assert_equal 600, file["expires_in_seconds"]
          assert_match(/rails\/active_storage\/blobs\/(redirect|proxy)\//, file["url"])
          assert_match(/disposition=attachment/, file["download_url"])
        end

        test "document without a file reports unavailable instead of fabricating a preview" do
          doc = pending_document(@tech)
          get "/api/v1/admin/trust_safety/documents/#{doc.id}/file", headers: auth_header_for(@admin)
          assert_response :ok
          file = JSON.parse(response.body)["file"]
          refute file["available"]
          assert_match(/No file/, file["reason"])
        end

        test "company documents are not exposed through the technician review surface" do
          company_user = User.create!(email: "co@example.com", password: "password123", password_confirmation: "password123", role: :company)
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
          doc = Document.create!(uploadable: company_profile, doc_type: "license", status: :pending_review)
          get "/api/v1/admin/trust_safety/documents/#{doc.id}/file", headers: auth_header_for(@admin)
          assert_response :forbidden
          get "/api/v1/admin/trust_safety/items/document/#{doc.id}", headers: auth_header_for(@admin)
          assert_response :not_found
        end

        test "document rejection requires a reason and approval records audit + notification" do
          doc = pending_document(@tech)
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "rejected" }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "reason_required", JSON.parse(response.body)["code"]
          assert doc.reload.pending_review?

          assert_difference -> { VerificationAuditLog.where(action: "document_approved").count }, 1 do
            assert_difference -> { AppNotification.where(user_id: @tech.id).count }, 1 do
              patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved", expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
            end
          end
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "Approved", body.dig("item", "status", "label")
          assert_equal "Ada Admin", body.dig("item", "reviewer_decision", "reviewer", "name")
          assert doc.reload.approved?
          assert_equal "verified", VerificationProfile.find_by(user_id: @tech.id).licenses_status
        end

        test "already reviewed document returns 409 unless an override with reason is supplied" do
          doc = pending_document(@tech)
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved", expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
          assert_response :ok

          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "rejected", reason: "Expired", expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
          assert_response :conflict
          assert_equal "already_reviewed", JSON.parse(response.body)["code"]
          assert doc.reload.approved?

          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "rejected", override: true, expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity

          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "rejected", override: true, reason: "License number does not match issuer records", expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert doc.reload.rejected?
          log = VerificationAuditLog.where(entity_type: "Document", entity_id: doc.id, action: "document_rereviewed").last
          assert log
          assert_equal "approved", log.details["previous_status"]
          assert_equal true, log.details["override"]
        end

        test "stale write on document review is rejected with latest state" do
          doc = pending_document(@tech)
          stale = (doc.updated_at - 1.hour).iso8601
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved", expected_updated_at: stale }, headers: auth_header_for(@admin), as: :json
          assert_response :conflict
          body = JSON.parse(response.body)
          assert_equal "stale_write", body["code"]
          assert_equal "Awaiting Review", body.dig("item", "status", "label")
          assert doc.reload.pending_review?

          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved", expected_updated_at: doc.updated_at.iso8601(6) }, headers: auth_header_for(@admin), as: :json
          assert_response :ok
        end

        test "request more information on a document notifies the technician and is audited" do
          doc = pending_document(@tech)
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/request_info", params: {}, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity

          assert_difference -> { AppNotification.where(user_id: @tech.id, title: "More information needed").count }, 1 do
            patch "/api/v1/admin/trust_safety/documents/#{doc.id}/request_info", params: { reason: "Please upload the back of the license." }, headers: auth_header_for(@admin), as: :json
          end
          assert_response :ok
          assert doc.reload.pending_review?
          assert VerificationAuditLog.exists?(entity_type: "Document", entity_id: doc.id, action: "document_info_requested")
        end

        # --- Background checks -------------------------------------------------------------------

        test "a not_started background check cannot be approved" do
          check = BackgroundCheck.create!(user: @tech, provider: "checkr", status: :not_started, normalized_status: "not_started", paid_by: "technician")
          get "/api/v1/admin/trust_safety/items/background_check/#{check.id}", headers: auth_header_for(@admin)
          item = JSON.parse(response.body)["item"]
          assert_equal "Not Started", item.dig("status", "label")
          refute item["actions"].any? { |a| a["key"] == "manually_approved" }, "no approve action should be offered"
          assert item["override_block_reason"].present?

          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_approved", reason: "Looks fine", confirm: true }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "override_not_allowed", JSON.parse(response.body)["code"]
          check.reload
          assert check.not_started?
          assert check.admin_override_status_none?
          refute @tech.technician_profile.reload.background_verified
        end

        test "pending, suspended and disputed reports cannot be treated as clear" do
          {
            "report_pending" => :pending,
            "report_suspended" => :suspended,
            "report_disputed" => :consider,
            "invitation_sent" => :invited,
            "report_pre_adverse_action" => :consider
          }.each do |normalized, legacy|
            user = create_technician(email: "bg-#{normalized}@example.com", first: "Case", last: normalized.titleize, trade: "HVAC", city: "Austin", state: "TX")
            check = BackgroundCheck.create!(user: user, provider: "checkr", status: legacy, normalized_status: normalized, provider_report_id: "rpt_#{normalized}", paid_by: "technician")
            patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                  params: { override_status: "manually_approved", reason: "test", confirm: true }, headers: auth_header_for(@admin), as: :json
            assert_response :unprocessable_entity, normalized
            assert_equal "override_not_allowed", JSON.parse(response.body)["code"], normalized
            check.reload
            refute check.eligible_for_background_gate?, "#{normalized} must not become eligible"
            assert_equal normalized, check.normalized_status
            refute user.technician_profile.reload.background_verified
          end
        end

        test "consider result stays consider until an explicit, confirmed, reasoned override" do
          check = consider_check(@tech)
          get "/api/v1/admin/trust_safety/items/background_check/#{check.id}", headers: auth_header_for(@admin)
          item = JSON.parse(response.body)["item"]
          assert_equal "Needs Review", item.dig("status", "label")
          assert_equal "consider", item.dig("provider_status", "key")
          refute item.dig("eligibility", "eligible_for_verified_badge")
          assert_nil item.dig("checkr", "raw")
          assert item["actions"].any? { |a| a["key"] == "manually_approved" && a["requires_reason"] && a["requires_confirmation"] }

          # Missing reason
          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_approved", confirm: true }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "reason_required", JSON.parse(response.body)["code"]
          # Missing confirmation
          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_approved", reason: "Reviewed report in Checkr; record is a dismissed traffic case." }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "confirmation_required", JSON.parse(response.body)["code"]
          check.reload
          assert check.consider?
          assert_equal "consider", check.normalized_status
          assert_equal "consider", check.result
          refute check.eligible_for_background_gate?

          assert_difference -> { VerificationAuditLog.where(action: "background_check_override").count }, 1 do
            patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                  params: { override_status: "manually_approved", reason: "Reviewed report in Checkr; record is a dismissed traffic case.", confirm: true, expected_updated_at: check.updated_at.iso8601(6) },
                  headers: auth_header_for(@admin), as: :json
          end
          assert_response :ok
          check.reload
          assert check.admin_override_status_manually_approved?
          assert check.eligible_for_background_gate?
          # Provider data is untouched; only the internal decision changed.
          assert_equal "consider", check.normalized_status
          assert_equal "consider", check.result
          assert_equal "complete", check.provider_status
          log = VerificationAuditLog.where(action: "background_check_override").last
          assert_equal "none", log.details["previous_override_status"]
          assert_equal "consider", log.details["provider_normalized_status"]
          assert_equal "Reviewed report in Checkr; record is a dismissed traffic case.", log.details["reason"]
          body = JSON.parse(response.body)
          assert_equal "Manually Approved", body.dig("item", "status", "label")
          assert_equal "Needs Review", body.dig("item", "status", "provider_label")
          assert @tech.technician_profile.reload.background_verified
        end

        test "stale background check override is rejected" do
          check = consider_check(@tech)
          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_rejected", reason: "x", confirm: true, expected_updated_at: (check.updated_at - 5.minutes).iso8601 },
                headers: auth_header_for(@admin), as: :json
          assert_response :conflict
          assert_equal "stale_write", JSON.parse(response.body)["code"]
          assert check.reload.admin_override_status_none?
        end

        test "review actions never call Checkr or Stripe" do
          check = consider_check(@tech)
          doc = pending_document(@tech)
          ref = responded_reference(@tech)
          boom = ->(*_args, **_kwargs) { raise "External provider must not be called during trust & safety review" }

          Net::HTTP.stub(:start, boom) do
            CheckrClient.stub(:new, boom) do
              patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                    params: { override_status: "manually_rejected", reason: "Ineligible per policy after review", confirm: true, expected_updated_at: expected_at(check) },
                    headers: auth_header_for(@admin), as: :json
              assert_response :ok
              patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved", expected_updated_at: expected_at(doc) }, headers: auth_header_for(@admin), as: :json
              assert_response :ok
              patch "/api/v1/admin/trust_safety/references/#{ref.id}/review", params: { status: "approved", expected_updated_at: expected_at(ref) }, headers: auth_header_for(@admin), as: :json
              assert_response :ok
            end
          end
          check.reload
          assert check.admin_override_status_manually_rejected?
          assert_equal "consider", check.normalized_status
          assert_equal "paid", check.payment_status
          refute @tech.technician_profile.reload.background_verified
        end

        # --- References -------------------------------------------------------------------------------

        test "reference review requires reason to reject, blocks approval before response without override, and detects conflicts" do
          requested = VerificationReference.create!(technician_user: @tech, full_name: "Dana Ref", email: "dana@example.com", relationship: "Supervisor", status: :requested, requested_at: 1.day.ago)
          patch "/api/v1/admin/trust_safety/references/#{requested.id}/review", params: { status: "approved" }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "override_required", JSON.parse(response.body)["code"]
          assert requested.reload.requested?

          patch "/api/v1/admin/trust_safety/references/#{requested.id}/review", params: { status: "approved", override: true, reason: "Verified by phone with Dana on 11/14; confirmed employment 2019-2023.", expected_updated_at: expected_at(requested) }, headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert requested.reload.approved?

          ref = responded_reference(@tech)
          patch "/api/v1/admin/trust_safety/references/#{ref.id}/review", params: { status: "rejected", expected_updated_at: expected_at(ref) }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "reason_required", JSON.parse(response.body)["code"]

          assert_difference -> { VerificationAuditLog.where(action: "reference_approved").count }, 1 do
            patch "/api/v1/admin/trust_safety/references/#{ref.id}/review", params: { status: "approved", expected_updated_at: expected_at(ref) }, headers: auth_header_for(@admin), as: :json
          end
          assert_response :ok
          assert_equal "Verified", JSON.parse(response.body).dig("item", "status", "label")
          assert_equal "verified", VerificationProfile.find_by(user_id: @tech.id).references_status

          patch "/api/v1/admin/trust_safety/references/#{ref.id}/review", params: { status: "rejected", reason: "dup", expected_updated_at: expected_at(ref) }, headers: auth_header_for(@admin), as: :json
          assert_response :conflict
          assert_equal "already_reviewed", JSON.parse(response.body)["code"]
        end

        test "reference info request and contact attempts are audited without changing the decision" do
          ref = responded_reference(@tech)
          patch "/api/v1/admin/trust_safety/references/#{ref.id}/contact_attempt", params: { outcome: "bogus" }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity

          patch "/api/v1/admin/trust_safety/references/#{ref.id}/contact_attempt", params: { outcome: "voicemail", method: "phone", note: "Left message" }, headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert ref.reload.responded?
          assert_equal "voicemail", ref.answers.dig("admin_contact", "last_outcome")
          assert_equal "phone", ref.answers.dig("admin_contact", "last_method")
          assert_equal @admin.id, ref.answers.dig("admin_contact", "last_contacted_by_user_id")
          log = VerificationAuditLog.where(entity_type: "VerificationReference", entity_id: ref.id, action: "reference_contact_attempt").last
          assert_equal "voicemail", log.details["outcome"]

          patch "/api/v1/admin/trust_safety/references/#{ref.id}/contact_attempt", params: { outcome: "text_sent", method: "sms", note: "Follow-up text" }, headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert_equal "text_sent", ref.reload.answers.dig("admin_contact", "last_outcome")
          assert_equal 2, ref.answers["contact_attempts"].size

          assert_difference -> { AppNotification.where(user_id: @tech.id).count }, 1 do
            patch "/api/v1/admin/trust_safety/references/#{ref.id}/request_info", params: { reason: "Please confirm the reference's current phone number." }, headers: auth_header_for(@admin), as: :json
          end
          assert_response :ok
          assert ref.reload.responded?
        end

        # --- Notes / audit ---------------------------------------------------------------------------------

        test "reviewer notes and audit feed" do
          doc = pending_document(@tech)
          post "/api/v1/admin/trust_safety/items/document/#{doc.id}/notes", params: { note: "" }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity

          post "/api/v1/admin/trust_safety/items/document/#{doc.id}/notes", params: { note: "Called issuer; awaiting callback." }, headers: auth_header_for(@admin), as: :json
          assert_response :created
          body = JSON.parse(response.body)
          assert_equal "reviewer_note", body.dig("event", "action")
          assert_equal "Ada Admin", body.dig("event", "actor", "name")
          assert doc.reload.pending_review?

          get "/api/v1/admin/trust_safety/items/document/#{doc.id}", headers: auth_header_for(@admin)
          actions = JSON.parse(response.body)["audit"].map { |row| row["action"] }
          assert_includes actions, "reviewer_note"
          assert_includes actions, "document_accessed"

          get "/api/v1/admin/trust_safety/audit", params: { technician_user_id: @tech.id }, headers: auth_header_for(@admin)
          assert_response :ok
          events = JSON.parse(response.body)["events"]
          assert events.any? { |evt| evt["action"] == "reviewer_note" }
          assert_equal "Maria Lopez", events.first.dig("technician", "display_name")
          assert_equal "document:#{doc.id}", events.first["item_key"]

          get "/api/v1/admin/trust_safety/audit", params: { technician_user_id: @other_tech.id }, headers: auth_header_for(@admin)
          assert_equal [], JSON.parse(response.body)["events"]
        end

        test "unknown item type is not found" do
          get "/api/v1/admin/trust_safety/items/widget/1", headers: auth_header_for(@admin)
          assert_response :not_found
        end

        test "company documents cannot be reviewed through the technician review surface" do
          company_user = User.create!(email: "co-review@example.com", password: "password123", password_confirmation: "password123", role: :company)
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
          doc = Document.create!(uploadable: company_profile, doc_type: "license", status: :pending_review)
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review",
                params: { status: "approved", expected_updated_at: expected_at(doc) },
                headers: auth_header_for(@admin), as: :json
          assert_response :forbidden
          assert doc.reload.pending_review?
        end

        test "decision writes require expected_updated_at" do
          doc = pending_document(@tech)
          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review", params: { status: "approved" }, headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "expected_updated_at_required", JSON.parse(response.body)["code"]
          assert doc.reload.pending_review?

          check = consider_check(@other_tech)
          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_approved", reason: "ok", confirm: true },
                headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity
          assert_equal "expected_updated_at_required", JSON.parse(response.body)["code"]
        end

        test "document file and item detail access are audited without storing URLs" do
          doc = pending_document(@tech)
          doc.file.attach(io: StringIO.new("%PDF-1.4 test"), filename: "license.pdf", content_type: "application/pdf")

          assert_difference -> { VerificationAuditLog.where(action: "document_accessed").count }, 1 do
            get "/api/v1/admin/trust_safety/documents/#{doc.id}/file", headers: auth_header_for(@admin)
          end
          assert_response :ok
          log = VerificationAuditLog.where(action: "document_accessed").last
          assert_equal "document_file", log.details["source"]
          assert_equal "license.pdf", log.details["filename"]
          refute log.details.key?("url")
          refute log.details.values.any? { |v| v.to_s.include?("/rails/active_storage") }

          assert_difference -> { VerificationAuditLog.where(action: "document_accessed").count }, 1 do
            get "/api/v1/admin/trust_safety/items/document/#{doc.id}", headers: auth_header_for(@admin)
          end
          assert_response :ok
          assert_equal "item_detail", VerificationAuditLog.where(action: "document_accessed").last.details["source"]
        end

        test "admin can create edit verify and remove references without auto-verifying" do
          post "/api/v1/admin/trust_safety/technicians/#{@tech.id}/references",
               params: { full_name: "Jordan Boss", phone: "5125550199", company_name: "Acme", relationship: "Former supervisor" },
               headers: auth_header_for(@admin), as: :json
          assert_response :created
          body = JSON.parse(response.body)
          ref_id = body.dig("item", "id")
          assert_equal "Awaiting Response", body.dig("item", "status", "label")
          assert_equal "requested", VerificationReference.find(ref_id).status
          assert_includes body.dig("trust_profile", "checklist").map { |r| r["key"] }, "references"
          refute body.dig("trust_profile", "checklist").any? { |r| r["key"] == "identity" }

          patch "/api/v1/admin/trust_safety/references/#{ref_id}",
                params: { company_name: "Acme Electric", email: "jordan@example.com" },
                headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert_equal "Acme Electric", VerificationReference.find(ref_id).company_name

          patch "/api/v1/admin/trust_safety/references/#{ref_id}/review",
                params: { status: "approved", reason: "Verified by phone on site visit", override: true, expected_updated_at: expected_at(VerificationReference.find(ref_id)) },
                headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert VerificationReference.find(ref_id).approved?
          assert_equal @admin.id, VerificationReference.find(ref_id).reviewed_by_user_id

          delete "/api/v1/admin/trust_safety/references/#{ref_id}",
                 params: { confirm: true },
                 headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert_nil VerificationReference.find_by(id: ref_id)
          assert VerificationAuditLog.where(action: "reference_admin_destroyed").exists?

          post "/api/v1/admin/trust_safety/technicians/#{@tech.id}/references",
               params: { full_name: "No Contact" },
               headers: auth_header_for(@admin), as: :json
          assert_response :unprocessable_entity

          post "/api/v1/admin/trust_safety/technicians/#{@tech.id}/references",
               params: { full_name: "Blocked", phone: "5125550111" },
               headers: auth_header_for(@tech), as: :json
          assert_response :forbidden
        end

        test "admin can create and update credentials without auto-approving" do
          post "/api/v1/admin/trust_safety/technicians/#{@tech.id}/credentials",
               params: {
                 doc_type: "license",
                 title: "Texas Electrical License",
                 trade: "Electrician",
                 issuer: "Texas TDLR",
                 document_number: "EL-999",
                 state: "TX",
                 verification_method: "document_review"
               },
               headers: auth_header_for(@admin), as: :json
          assert_response :created
          body = JSON.parse(response.body)
          doc_id = body.dig("item", "id")
          doc = Document.find(doc_id)
          assert doc.pending_review?
          assert_equal "Texas TDLR", doc.issuer
          assert_equal "Texas Electrical License", doc.metadata["title"]
          assert_equal "TX", doc.metadata["state"]

          patch "/api/v1/admin/trust_safety/documents/#{doc_id}",
                params: { document_number: "EL-1000", admin_notes: "Checked TDLR portal" },
                headers: auth_header_for(@admin), as: :json
          assert_response :ok
          doc.reload
          assert_equal "EL-1000", doc.document_number
          assert_equal "Checked TDLR portal", doc.metadata["admin_notes"]
          assert doc.pending_review?

          patch "/api/v1/admin/trust_safety/documents/#{doc_id}/review",
                params: { status: "approved", expected_updated_at: expected_at(doc) },
                headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert doc.reload.approved?
        end

        private

        def create_technician(email:, first:, last:, trade:, city:, state:)
          user = User.create!(email: email, password: "password123", password_confirmation: "password123", role: :technician, first_name: first, last_name: last)
          TechnicianProfile.create!(user: user, trade_type: trade, availability: "Full-time", membership_level: "basic", city: city, state: state, phone: "5125550100", experience_years: 7)
          user.reload
        end

        def pending_document(user, doc_type: "license", with_file: false)
          doc = Document.create!(uploadable: user.technician_profile, doc_type: doc_type, status: :pending_review, issuer: "Texas Department of Licensing", document_number: "TX-12345", valid_until: 1.year.from_now.to_date)
          if with_file
            doc.file.attach(io: StringIO.new("\x89PNG\r\n\x1a\nfake"), filename: "license.png", content_type: "image/png")
          end
          doc
        end

        def responded_reference(user)
          VerificationReference.create!(technician_user: user, full_name: "Reference #{user.first_name}", email: "ref-#{user.id}@example.com", relationship: "Supervisor", company_name: "Acme HVAC", status: :responded, requested_at: 3.days.ago, responded_at: 1.day.ago, answers: { "would_rehire" => "yes" })
        end

        def consider_check(user)
          BackgroundCheck.create!(user: user, provider: "checkr", status: :consider, normalized_status: "consider", result: "consider", provider_status: "complete", provider_report_id: "rpt_consider_#{user.id}", provider_candidate_id: "cand_#{user.id}", package_name: "essential_plus", payment_status: :paid, paid_by: "technician", started_at: 5.days.ago, completed_at: 1.day.ago)
        end

        def clear_check(user)
          BackgroundCheck.create!(user: user, provider: "checkr", status: :clear, normalized_status: "clear", result: "clear", provider_status: "complete", provider_report_id: "rpt_clear_#{user.id}", package_name: "essential_plus", payment_status: :paid, paid_by: "technician", started_at: 5.days.ago, completed_at: 1.day.ago, expires_at: 1.year.from_now)
        end
      end
    end
  end
end
