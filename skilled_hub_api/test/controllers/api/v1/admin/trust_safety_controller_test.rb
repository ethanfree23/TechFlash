require "test_helper"

module Api
  module V1
    module Admin
      class TrustSafetyControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "dashboard requires admin auth" do
          get "/api/v1/admin/trust_safety/dashboard", as: :json
          assert_response :unauthorized

          company_user = User.create!(
            email: "company-trust-safety-forbidden@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
          company_user.update_column(:company_profile_id, company_profile.id)

          get "/api/v1/admin/trust_safety/dashboard",
              headers: auth_header_for(company_user),
              as: :json
          assert_response :forbidden
        end

        test "admin can load dashboard and invalid reference review status is rejected" do
          admin = User.create!(
            email: "admin-trust-safety@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          tech_user = User.create!(
            email: "tech-trust-safety-ref@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          TechnicianProfile.create!(user: tech_user, trade_type: "HVAC", availability: "Full-time", membership_level: "basic")
          ref = VerificationReference.create!(
            technician_user: tech_user,
            full_name: "Reference Person",
            email: "refperson@example.com",
            relationship: "Supervisor",
            status: :responded,
            requested_at: 2.days.ago,
            responded_at: 1.day.ago
          )

          get "/api/v1/admin/trust_safety/dashboard",
              headers: auth_header_for(admin),
              as: :json
          assert_response :ok

          patch "/api/v1/admin/trust_safety/references/#{ref.id}/review",
                params: { status: "invalid_status" },
                headers: auth_header_for(admin),
                as: :json
          assert_response :unprocessable_entity
        end

        test "non admin cannot execute trust safety review actions" do
          tech_user = User.create!(
            email: "tech-trust-safety-forbidden@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          technician_profile = TechnicianProfile.create!(user: tech_user, trade_type: "HVAC", availability: "Full-time", membership_level: "basic")
          ref = VerificationReference.create!(
            technician_user: tech_user,
            full_name: "Reference Person",
            email: "refperson2@example.com",
            relationship: "Supervisor",
            status: :responded,
            requested_at: 2.days.ago,
            responded_at: 1.day.ago
          )
          doc = Document.create!(
            uploadable: technician_profile,
            doc_type: "license",
            status: :pending_review
          )
          check = BackgroundCheck.create!(
            user: tech_user,
            provider: "checkr",
            package_name: "essential_plus",
            status: :pending,
            payment_status: :paid,
            paid_by: "technician"
          )

          patch "/api/v1/admin/trust_safety/background_checks/#{check.id}/override",
                params: { override_status: "manually_approved" },
                headers: auth_header_for(tech_user),
                as: :json
          assert_response :forbidden

          patch "/api/v1/admin/trust_safety/references/#{ref.id}/review",
                params: { status: "approved" },
                headers: auth_header_for(tech_user),
                as: :json
          assert_response :forbidden

          patch "/api/v1/admin/trust_safety/documents/#{doc.id}/review",
                params: { status: "approved" },
                headers: auth_header_for(tech_user),
                as: :json
          assert_response :forbidden
        end
      end
    end
  end
end
