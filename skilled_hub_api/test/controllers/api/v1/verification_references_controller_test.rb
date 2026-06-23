require "test_helper"

module Api
  module V1
    class VerificationReferencesControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "reference endpoints require technician role" do
        get "/api/v1/verification_references", as: :json
        assert_response :unauthorized

        company_user = User.create!(
          email: "reference-company-forbidden@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)

        post "/api/v1/verification_references",
             params: {
               full_name: "Jordan Smith",
               email: "jordan@example.com",
               relationship: "Supervisor"
             },
             headers: auth_header_for(company_user),
             as: :json
        assert_response :forbidden
      end

      test "technician can create reference request and public token response" do
        tech_user = User.create!(
          email: "reference-tech@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: tech_user,
          trade_type: "HVAC",
          availability: "Full-time",
          membership_level: "basic"
        )

        post "/api/v1/verification_references",
             params: {
               full_name: "Jordan Smith",
               email: "jordan@example.com",
               phone: "5551112233",
               company_name: "Smith Mechanical",
               relationship: "Supervisor"
             },
             headers: auth_header_for(tech_user),
             as: :json

        assert_response :created
        payload = JSON.parse(response.body)
        assert payload["response_link"].present?
        ref = VerificationReference.order(:id).last
        assert_equal "requested", ref.status
        assert ref.request_token.present?

        post "/api/v1/verification_references/respond/#{ref.request_token}",
             params: {
               would_rehire: "yes",
               reliability: "5",
               quality: "5",
               communication: "5",
               safety: "5",
               comments: "Great technician."
             },
             as: :json

        assert_response :ok
        ref.reload
        assert_equal "responded", ref.status
        assert_equal "yes", ref.answers["would_rehire"]

        post "/api/v1/verification_references/respond/#{ref.request_token}",
             params: {
               would_rehire: "yes",
               reliability: "5",
               quality: "5",
               communication: "5",
               safety: "5",
               comments: "Duplicate submit."
             },
             as: :json
        assert_response :unprocessable_entity
      end
    end
  end
end
