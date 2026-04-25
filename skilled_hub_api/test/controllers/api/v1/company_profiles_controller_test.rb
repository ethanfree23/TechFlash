require "test_helper"

module Api
  module V1
    class CompanyProfilesControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "admin can merge current company into selected company by default" do
        admin = User.create!(
          email: "admin-merge-company-default@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )

        current_owner = User.create!(
          email: "company-current-default-owner@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        selected_owner = User.create!(
          email: "company-selected-default-owner@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        current = CompanyProfile.create!(user: current_owner, company_name: "Current Default Co")
        selected = CompanyProfile.create!(user: selected_owner, company_name: "Selected Default Co")
        current_member = User.create!(
          email: "company-current-default-member@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company,
          company_profile_id: current.id
        )

        post "/api/v1/company_profiles/#{current.id}/merge",
             params: {
               target_company_profile_id: selected.id
             },
             headers: auth_header_for(admin),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal selected.id, body["target_company_profile_id"]
        assert_equal current.id, body["source_company_profile_id"]
        assert_equal "into_target", body["merge_direction"]

        assert_nil CompanyProfile.find_by(id: current.id)
        assert_not_nil CompanyProfile.find_by(id: selected.id)
        assert_equal selected.id, current_member.reload.company_profile_id
      end

      test "admin can merge selected company into current company" do
        admin = User.create!(
          email: "admin-merge-company@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )

        current_owner = User.create!(
          email: "company-current-owner@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        selected_owner = User.create!(
          email: "company-selected-owner@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        current = CompanyProfile.create!(user: current_owner, company_name: "Current Co")
        selected = CompanyProfile.create!(user: selected_owner, company_name: "Selected Co")
        selected_member = User.create!(
          email: "company-selected-member@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company,
          company_profile_id: selected.id
        )

        post "/api/v1/company_profiles/#{current.id}/merge",
             params: {
               target_company_profile_id: selected.id,
               merge_direction: "into_current"
             },
             headers: auth_header_for(admin),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal current.id, body["target_company_profile_id"]
        assert_equal selected.id, body["source_company_profile_id"]
        assert_equal "into_current", body["merge_direction"]

        assert_nil CompanyProfile.find_by(id: selected.id)
        assert_not_nil CompanyProfile.find_by(id: current.id)
        assert_equal current.id, selected_member.reload.company_profile_id
      end
    end
  end
end
