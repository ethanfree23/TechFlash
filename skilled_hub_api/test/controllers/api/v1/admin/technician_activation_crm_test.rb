# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class TechnicianActivationCrmTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin+activation_crm@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            first_name: "Ada",
            last_name: "Admin"
          )
          @tech = User.create!(
            email: "tech+activation_crm@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: "Daniel",
            last_name: "Hernandez",
            phone: "5551112222"
          )
          TechnicianProfile.create!(
            user: @tech,
            trade_type: "Electrician",
            phone: "5551112222",
            city: "Houston",
            state: "TX",
            zip_code: "77007"
          )
          @company = User.create!(
            email: "company+activation_crm@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          CompanyProfile.create!(user: @company, company_name: "Acme Co")
        end

        test "log call creates interaction follow-up and updates activation" do
          client_key = "test-call-1"
          post "/api/v1/admin/users/#{@tech.id}/log_call",
               params: {
                 outcome: "left_voicemail",
                 body: "Left VM about onboarding",
                 follow_up_at: 1.day.from_now.change(usec: 0).iso8601,
                 client_key: client_key
               },
               headers: auth_header_for(@admin),
               as: :json

          assert_response :created
          body = JSON.parse(response.body)
          assert_equal "voicemail", body.dig("interaction", "interaction_type")
          assert_equal "left_voicemail", body.dig("interaction", "outcome")
          assert_equal "contacting", body.dig("activation", "status")
          assert body.dig("follow_up", "id").present?
          assert body.dig("activation", "last_contacted_at").present?

          # Idempotent replay
          post "/api/v1/admin/users/#{@tech.id}/log_call",
               params: {
                 outcome: "left_voicemail",
                 body: "Left VM about onboarding",
                 client_key: client_key
               },
               headers: auth_header_for(@admin),
               as: :json
          assert_response :created
          assert_equal 1, TechnicianInteraction.where(user_id: @tech.id, interaction_type: %w[call voicemail]).count
        end

        test "import_local migrates browser notes without duplicates" do
          notes = [
            { id: 111, body: "Called once already", at: 2.days.ago.iso8601, admin: "Admin" },
            { id: 112, body: "Needs license upload", at: 1.day.ago.iso8601, admin: "Admin" }
          ]

          post "/api/v1/admin/users/#{@tech.id}/technician_interactions/import_local",
               params: { notes: notes },
               headers: auth_header_for(@admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 2, body["imported_count"]
          assert_equal 0, body["skipped_count"]

          post "/api/v1/admin/users/#{@tech.id}/technician_interactions/import_local",
               params: { notes: notes },
               headers: auth_header_for(@admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal 0, body["imported_count"]
          assert_equal 2, body["skipped_count"]
          assert_equal 2, TechnicianInteraction.where(user_id: @tech.id, interaction_type: "note").count
        end

        test "activation status update records status_change interaction" do
          patch "/api/v1/admin/users/#{@tech.id}/technician_activation",
                params: { status: "engaged", current_availability: "available_soon", note: "Warm lead" },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "engaged", body.dig("activation", "status")
          assert_equal "available_soon", body.dig("activation", "current_availability")

          change = TechnicianInteraction.find_by(user_id: @tech.id, interaction_type: "status_change")
          assert change
          assert_equal "new", change.metadata["previous_status"]
          assert_equal "engaged", change.metadata["new_status"]
        end

        test "follow-ups index scopes and complete" do
          due = Time.current.change(usec: 0)
          follow = TechnicianFollowUp.create!(
            user: @tech,
            assigned_admin: @admin,
            created_by: @admin,
            due_at: due - 1.hour,
            description: "Call back"
          )

          get "/api/v1/admin/technician_follow_ups",
              params: { scope: "overdue" },
              headers: auth_header_for(@admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert body["follow_ups"].any? { |fu| fu["id"] == follow.id }
          assert body.dig("counts", "overdue").to_i >= 1

          patch "/api/v1/admin/technician_follow_ups/#{follow.id}",
                params: { status: "completed" },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :ok
          assert_equal "completed", JSON.parse(response.body).dig("follow_up", "status")
          assert follow.reload.completed_at.present?
        end

        test "rejects company users and non-admins" do
          post "/api/v1/admin/users/#{@company.id}/log_call",
               params: { outcome: "connected" },
               headers: auth_header_for(@admin),
               as: :json
          assert_response :unprocessable_entity

          tech_headers = auth_header_for(@tech)
          get "/api/v1/admin/users/#{@tech.id}/technician_activation", headers: tech_headers
          assert_response :forbidden
        end

        test "users index includes activation payload" do
          TechnicianActivation.ensure_for!(@tech).update!(
            status: "contacting",
            last_contacted_at: Time.current,
            last_call_outcome: "no_answer"
          )

          get "/api/v1/admin/users",
              params: { role: "technician" },
              headers: auth_header_for(@admin)

          assert_response :ok
          body = JSON.parse(response.body)
          row = body["users"].find { |u| u["id"] == @tech.id }
          assert row
          assert_equal "contacting", row.dig("activation", "status")
          assert_equal "no_answer", row.dig("activation", "last_call_outcome")
          assert body["activation_pipeline_counts"].is_a?(Hash)
        end

        test "manual ready status does not imply verification complete" do
          patch "/api/v1/admin/users/#{@tech.id}/technician_activation",
                params: { status: "ready" },
                headers: auth_header_for(@admin),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "ready", body.dig("activation", "status")
          onboarding = body.dig("activation", "onboarding")
          assert onboarding
          # Background check still incomplete for a fresh tech — CRM ready != eligible
          refute_includes Array(onboarding["blocker_keys"]), "status"
          assert_includes Array(onboarding["blocker_keys"]), "background_check"
          assert_equal false, @tech.technician_profile.reload.background_verified
        end
      end
    end
  end
end
