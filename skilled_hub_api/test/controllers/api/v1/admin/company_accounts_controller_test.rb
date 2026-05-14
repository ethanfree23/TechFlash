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
                 company_profile_id: profile.id,
                 first_name: "Pat",
                 last_name: "Manager",
                 phone: "555-222-3333"
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
          assert_equal "Pat", created.first_name
          assert_equal "Manager", created.last_name
          assert_equal "555-222-3333", created.phone
        end

        test "create new company links CRM lead when crm_lead_id is provided" do
          admin = User.create!(
            email: "admin+crm_link_company_accounts@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(name: "CRM Link Co", status: "lead")

          post "/api/v1/admin/company_accounts",
               params: {
                 email: "provision+crm_link_new@example.com",
                 first_name: "CRM",
                 last_name: "LinkCo",
                 phone: "555-888-0001",
                 company_name: "CRM Link Co LLC",
                 state: "Texas",
                 bio: "Company profile for CRM link test",
                 crm_lead_id: lead.id
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          assert_equal 1, CrmLead.count, "Provisioning from CRM must not create a duplicate CrmLead"
          lead.reload
          assert lead.linked_user_id.present?
          assert lead.linked_company_profile_id.present?
          linked_user = User.find(lead.linked_user_id)
          assert linked_user.company?
          assert_equal lead.linked_company_profile_id, linked_user.company_profile_id
        end

        test "bulk_crm provisions multiple logins and sets linked_user_id on CRM contacts" do
          admin = User.create!(
            email: "admin+bulk_crm@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(
            name: "Bulk CRM Co",
            status: "lead",
            contacts: [
              { "name" => "Alice Owner", "email" => "alice+bulk_crm@example.com", "phone" => "555-111-1111" },
              { "name" => "Bob Ops", "email" => "bob+bulk_crm@example.com", "phone" => "555-222-2222" }
            ]
          )

          post "/api/v1/admin/company_accounts/bulk_crm",
               params: {
                 crm_lead_id: lead.id,
                 company: {
                   company_name: "Bulk CRM Co LLC",
                   state: "Texas",
                   bio: "Bio for bulk CRM company profile.",
                   industry: "HVAC | Plumbing",
                   location: "Austin, Texas"
                 },
                 contacts: [
                   {
                     contact_index: 0,
                     email: "alice+bulk_crm@example.com",
                     first_name: "Alice",
                     last_name: "Owner",
                     phone: "555-111-1111",
                     selected: true
                   },
                   {
                     contact_index: 1,
                     email: "bob+bulk_crm@example.com",
                     first_name: "Bob",
                     last_name: "Ops",
                     phone: "555-222-2222",
                     selected: true
                   }
                 ]
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          assert_equal 1, CrmLead.count
          lead.reload
          alice = User.find_by!(email: "alice+bulk_crm@example.com")
          bob = User.find_by!(email: "bob+bulk_crm@example.com")
          assert_equal alice.company_profile_id, bob.company_profile_id
          assert_equal lead.linked_company_profile_id, alice.company_profile_id
          assert_equal alice.id, lead.linked_user_id

          c0 = lead.contacts[0].with_indifferent_access
          c1 = lead.contacts[1].with_indifferent_access
          assert_equal alice.id, c0[:linked_user_id]
          assert_equal bob.id, c1[:linked_user_id]
        end

        test "bulk_crm provisions one login when a single CRM contact is selected" do
          admin = User.create!(
            email: "admin+bulk_crm_one@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )
          lead = CrmLead.create!(
            name: "Single Contact CRM Co",
            status: "lead",
            contacts: [
              { "name" => "Chris Solo", "email" => "chris+bulk_crm_one@example.com", "phone" => "555-333-3333" }
            ]
          )

          post "/api/v1/admin/company_accounts/bulk_crm",
               params: {
                 crm_lead_id: lead.id,
                 company: {
                   company_name: "Single Contact CRM Co LLC",
                   state: "Texas",
                   bio: "Bio for single-contact bulk CRM company profile.",
                   industry: "Electrical",
                   location: "Houston, Texas"
                 },
                 contacts: [
                   {
                     contact_index: 0,
                     email: "chris+bulk_crm_one@example.com",
                     first_name: "Chris",
                     last_name: "Solo",
                     phone: "555-333-3333",
                     selected: true
                   }
                 ]
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          assert_equal 1, CrmLead.count
          lead.reload
          chris = User.find_by!(email: "chris+bulk_crm_one@example.com")
          assert_equal lead.linked_company_profile_id, chris.company_profile_id
          assert_equal chris.id, lead.linked_user_id

          c0 = lead.contacts[0].with_indifferent_access
          assert_equal chris.id, c0[:linked_user_id]
        end

        test "create additional company login links CRM lead when crm_lead_id is provided" do
          admin = User.create!(
            email: "admin+crm_link_login@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          owner = User.create!(
            email: "owner+crm_link_login@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          profile = CompanyProfile.create!(
            user: owner,
            company_name: "Existing For CRM Link",
            phone: "555-777-0001",
            bio: "Existing company for CRM link login test"
          )
          owner.update_column(:company_profile_id, profile.id)

          lead = CrmLead.create!(name: "Existing For CRM Link", status: "lead")

          post "/api/v1/admin/company_accounts",
               params: {
                 email: "second.login+crm_link@example.com",
                 company_profile_id: profile.id,
                 first_name: "Second",
                 last_name: "Login",
                 phone: "555-777-0002",
                 crm_lead_id: lead.id
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          lead.reload
          assert_equal profile.id, lead.linked_company_profile_id
          assert_equal "second.login+crm_link@example.com", User.find(lead.linked_user_id).email
        end
      end
    end
  end
end
