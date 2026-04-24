require "test_helper"

module Api
  module V1
    module Admin
      class CompanyAccountsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "search_companies returns matching companies with user counts" do
          admin = User.create!(
            email: "admin+search_companies_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          owner = User.create!(
            email: "owner+search_companies_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          profile = CompanyProfile.create!(
            user: owner,
            company_name: "Alpha Mechanical",
            phone: "555-900-1000",
            bio: "Search companies target"
          )
          owner.update_column(:company_profile_id, profile.id)
          User.create!(
            email: "second+search_companies_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            company_profile_id: profile.id
          )

          get "/api/v1/admin/company_accounts/search_companies",
              params: { q: "alpha" },
              headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          companies = body.fetch("companies")
          assert_equal 1, companies.length
          assert_equal profile.id, companies.first.fetch("id")
          assert_equal "Alpha Mechanical", companies.first.fetch("company_name")
          assert_equal 2, companies.first.fetch("company_users_count")
        end

        test "creates additional company login under existing company profile" do
          admin = User.create!(
            email: "admin+company_accounts_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          owner = User.create!(
            email: "owner+company_accounts_test@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          profile = CompanyProfile.create!(
            user: owner,
            company_name: "Existing Co",
            phone: "555-111-2222",
            bio: "Existing company profile for tests"
          )
          owner.update_column(:company_profile_id, profile.id)

          post "/api/v1/admin/company_accounts",
               params: {
                 email: "new.login+company_accounts_test@example.com",
                 company_profile_id: profile.id
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          body = JSON.parse(response.body)
          assert_equal profile.id, body.dig("company_profile", "id")
          assert_equal "new.login+company_accounts_test@example.com", body.dig("user", "email")

          created = User.find_by!(email: "new.login+company_accounts_test@example.com")
          assert_equal profile.id, created.company_profile_id
          assert created.company?
        end
      end
    end
  end
end
