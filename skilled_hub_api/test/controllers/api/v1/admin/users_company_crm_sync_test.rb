# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersCompanyCrmSyncTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "company_membership syncs user into target company crm contacts" do
          admin = User.create!(
            email: "admin-membership-sync@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0600"
          )

          owner_a = User.create!(
            email: "owner-membership-a@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0601"
          )
          profile_a = CompanyProfile.create!(user: owner_a, company_name: "Membership A", phone: "555-111-1000", bio: "Bio A")
          owner_a.update_column(:company_profile_id, profile_a.id)

          owner_b = User.create!(
            email: "owner-membership-b@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0602"
          )
          profile_b = CompanyProfile.create!(user: owner_b, company_name: "Membership B", phone: "555-222-1000", bio: "Bio B")
          owner_b.update_column(:company_profile_id, profile_b.id)

          lead_b = CrmLead.create!(
            name: "Membership B CRM",
            status: "lead",
            linked_company_profile_id: profile_b.id,
            linked_user_id: owner_b.id,
            contacts: [{ "name" => "Owner B", "email" => owner_b.email, "phone" => owner_b.phone, "linked_user_id" => owner_b.id }]
          )

          moving_user = User.create!(
            email: "moving-membership-sync@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            first_name: "Moving",
            last_name: "User",
            phone: "713-555-0603",
            company_profile_id: profile_a.id
          )

          patch "/api/v1/admin/users/#{moving_user.id}/company_membership",
                params: { company_profile_id: profile_b.id },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          moving_user.reload
          assert_equal profile_b.id, moving_user.company_profile_id

          lead_b.reload
          synced = lead_b.contacts.find { |row| row["linked_user_id"].to_i == moving_user.id }
          assert_not_nil synced
          assert_equal "moving-membership-sync@example.com", synced["email"]
          assert_equal "Moving User", synced["name"]
        end

        test "admin profile update refreshes linked crm contact fields" do
          admin = User.create!(
            email: "admin-profile-sync@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0604"
          )

          company_user = User.create!(
            email: "company-profile-sync@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            first_name: "Old",
            last_name: "Name",
            phone: "713-555-0605"
          )
          profile = CompanyProfile.create!(user: company_user, company_name: "Profile Sync Co", phone: "555-333-1000", bio: "Bio")
          company_user.update_column(:company_profile_id, profile.id)

          lead = CrmLead.create!(
            name: "Profile Sync CRM",
            status: "lead",
            linked_company_profile_id: profile.id,
            linked_user_id: company_user.id,
            contacts: [
              {
                "name" => "Old Name",
                "email" => "company-profile-sync@example.com",
                "phone" => "111-111-1111",
                "linked_user_id" => company_user.id
              }
            ]
          )

          patch "/api/v1/admin/users/#{company_user.id}/profile",
                params: {
                  first_name: "New",
                  last_name: "Person",
                  account_phone: "713-555-0999"
                },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          lead.reload
          contact = lead.contacts.find { |row| row["linked_user_id"].to_i == company_user.id }
          assert_not_nil contact
          assert_equal "New Person", contact["name"]
          assert_equal "713-555-0999", contact["phone"]
          assert_equal "company-profile-sync@example.com", contact["email"]
        end
      end
    end
  end
end
