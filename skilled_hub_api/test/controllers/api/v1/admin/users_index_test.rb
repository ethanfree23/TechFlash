# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersIndexTest < ActionDispatch::IntegrationTest
        include AuthTestHelper
        include ActiveSupport::Testing::TimeHelpers

        test "index returns logins_last_30_days excluding masquerade-marked events" do
          admin = User.create!(
            email: "admin-index-login@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
          u1 = User.create!(
            email: "tech-login-count@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          TechnicianProfile.create!(user: u1, trade_type: "General", availability: "Full-time")
          u2 = User.create!(
            email: "tech-login-masq@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          TechnicianProfile.create!(user: u2, trade_type: "Electric", availability: "Full-time")

          t = Time.zone.now
          travel_to t do
            2.times do
              UserLoginEvent.create!(user_id: u1.id, via_masquerade: false, created_at: 1.day.ago)
            end
            UserLoginEvent.create!(user_id: u2.id, via_masquerade: false, created_at: 1.day.ago)
            UserLoginEvent.create!(user_id: u2.id, via_masquerade: true, created_at: 1.day.ago)
            UserLoginEvent.create!(
              user_id: u1.id,
              via_masquerade: false,
              created_at: 31.days.ago
            )
          end

          get "/api/v1/admin/users", headers: auth_header_for(admin)
          assert_response :ok
          body = JSON.parse(response.body)
          rows = body["users"].index_by { |r| r["id"] }
          assert_equal 2, rows[u1.id]["logins_last_30_days"]
          assert_equal 1, rows[u2.id]["logins_last_30_days"]
        end

        test "index returns shared company name for additional company logins" do
          admin = User.create!(
            email: "admin-index-shared-co@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
          owner = User.create!(
            email: "owner-index-shared-co@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0501"
          )
          profile = CompanyProfile.create!(
            user: owner,
            company_name: "Shared Org For Index Test",
            phone: "555-100-2000",
            bio: "Test profile"
          )
          owner.update_column(:company_profile_id, profile.id)

          additional = User.create!(
            email: "extra-login-index-shared-co@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            company_profile_id: profile.id,
            first_name: "Extra",
            last_name: "Login",
            phone: "713-555-0502"
          )

          get "/api/v1/admin/users", headers: auth_header_for(admin)
          assert_response :ok
          body = JSON.parse(response.body)
          row = body["users"].find { |u| u["id"] == additional.id }
          assert_equal "Shared Org For Index Test", row["company_name"]
        end

        test "index includes membership tier for company and technician users" do
          admin = User.create!(
            email: "admin-index-membership@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )

          company = User.create!(
            email: "company-membership-index@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0501"
          )
          CompanyProfile.create!(
            user: company,
            company_name: "Membership Co",
            membership_level: "pro",
            membership_status: "active"
          )

          technician = User.create!(
            email: "technician-membership-index@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician
          )
          TechnicianProfile.create!(
            user: technician,
            trade_type: "Electrical",
            availability: "Full-time",
            membership_level: "basic",
            membership_status: "trialing"
          )

          get "/api/v1/admin/users", headers: auth_header_for(admin)
          assert_response :ok

          rows = JSON.parse(response.body).fetch("users").index_by { |r| r.fetch("id") }
          assert_equal "pro", rows.fetch(company.id).fetch("membership_level")
          assert_equal "active", rows.fetch(company.id).fetch("membership_status")
          assert_equal "basic", rows.fetch(technician.id).fetch("membership_level")
          assert_equal "trialing", rows.fetch(technician.id).fetch("membership_status")
        end
      end
    end
  end
end
