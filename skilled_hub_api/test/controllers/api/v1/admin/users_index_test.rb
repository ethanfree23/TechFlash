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

        test "index includes technician skill class and experience years" do
          admin = create_admin_user!("admin-index-skill-class@example.com")
          technician = create_technician!(
            email: "tech-level-years@example.com",
            first_name: "Jordan",
            last_name: "Wire",
            phone: "713-555-0610",
            trade_type: "Electrician"
          )
          technician.technician_profile.update!(skill_class: "journeyman", experience_years: 8)
          company = create_company_user!(
            email: "company-no-skill@example.com",
            first_name: "Casey",
            last_name: "Office",
            phone: "713-555-0611",
            company_name: "No Skill Co"
          )

          get "/api/v1/admin/users", headers: auth_header_for(admin)
          assert_response :ok
          rows = JSON.parse(response.body).fetch("users").index_by { |r| r.fetch("id") }

          assert_equal "journeyman", rows.fetch(technician.id).fetch("skill_class")
          assert_equal 8, rows.fetch(technician.id).fetch("experience_years")
          assert_nil rows.fetch(company.id)["skill_class"]
          assert_nil rows.fetch(company.id)["experience_years"]
        end

        test "index search matches phones regardless of formatting including area code 832" do
          admin = create_admin_user!("admin-index-search-phone@example.com")
          formatted = create_technician!(
            email: "tech-832-formatted@example.com",
            first_name: "Area",
            last_name: "CodeFmt",
            phone: "+1 (832) 555-1212",
            trade_type: "Electrician"
          )
          dashed = create_technician!(
            email: "tech-832-dashed@example.com",
            first_name: "Area",
            last_name: "CodeDash",
            phone: "832-555-3434",
            trade_type: "Electrician"
          )
          e164 = create_technician!(
            email: "tech-832-e164@example.com",
            first_name: "Area",
            last_name: "CodeE164",
            phone: "+18325555678",
            trade_type: "Electrician"
          )
          other = create_technician!(
            email: "tech-713-other@example.com",
            first_name: "Other",
            last_name: "Area",
            phone: "713-555-9999",
            trade_type: "Electrician"
          )

          ids_for("832", admin: admin).tap do |ids|
            assert_includes ids, formatted.id
            assert_includes ids, dashed.id
            assert_includes ids, e164.id
            refute_includes ids, other.id
          end

          [
            "832555",
            "8325551212",
            "(832) 555-1212",
            "832-555-1212",
            "+1 832 555 1212",
            "+18325551212"
          ].each do |query|
            ids = ids_for(query, admin: admin)
            assert_includes ids, formatted.id, "expected formatted 832 user for #{query.inspect}"
            refute_includes ids, other.id, "did not expect 713 user for #{query.inspect}"
          end

          assert_includes ids_for("5551212", admin: admin), formatted.id
          assert_includes ids_for("8325553434", admin: admin), dashed.id
        end

        test "index search matches name email company trade zip and ignores misses" do
          admin = create_admin_user!("admin-index-search-fields@example.com")

          ethan = create_technician!(
            email: "ethan.search@example.com",
            first_name: "Ethan",
            last_name: "Freeman",
            phone: "281-555-0100",
            trade_type: "HVAC Technician",
            zip_code: "77002"
          )
          plumber = create_technician!(
            email: "trade-plumbing@example.com",
            first_name: "Pat",
            last_name: "Pipe",
            phone: "281-555-0101",
            trade_type: "Plumber",
            zip_code: "77301"
          )
          auto = create_technician!(
            email: "trade-auto@example.com",
            first_name: "Alex",
            last_name: "Motor",
            phone: "281-555-0102",
            trade_type: "Automobile Technician"
          )
          company = create_company_user!(
            email: "ops@fixit-search.co",
            first_name: "Casey",
            last_name: "Office",
            phone: "281-555-0103",
            company_name: "FixIt Search Co"
          )

          electrician = create_technician!(
            email: "trade-elec@example.com",
            first_name: "Eli",
            last_name: "Wire",
            phone: "281-555-0104",
            trade_type: "Electrician"
          )

          assert_includes ids_for("Ethan"), ethan.id
          assert_includes ids_for("Freeman"), ethan.id
          assert_includes ids_for("Ethan Freeman"), ethan.id
          assert_includes ids_for("ethan"), ethan.id
          assert_includes ids_for("@example.com"), ethan.id
          assert_includes ids_for("ethan.search"), ethan.id

          assert_includes ids_for("HVAC"), ethan.id
          assert_includes ids_for("electrician"), electrician.id
          assert_includes ids_for("plumbing"), plumber.id
          assert_includes ids_for("auto"), auto.id

          assert_includes ids_for("77002"), ethan.id
          assert_includes ids_for("770"), ethan.id
          refute_includes ids_for("770"), plumber.id

          assert_includes ids_for("FixIt Search Co"), company.id
          assert_includes ids_for("fixit"), company.id

          miss = ids_for("zzqx-no-such-admin-user")
          refute_includes miss, ethan.id
          refute_includes miss, plumber.id
          refute_includes miss, company.id
        end

        test "index search narrows the current role filter" do
          admin = create_admin_user!("admin-index-search-role@example.com")
          tech = create_technician!(
            email: "role-search-tech@example.com",
            first_name: "Riley",
            last_name: "Tech",
            phone: "832-555-8888",
            trade_type: "HVAC Technician"
          )
          company = create_company_user!(
            email: "role-search-co@example.com",
            first_name: "Cora",
            last_name: "Company",
            phone: "832-555-8889",
            company_name: "Role Search LLC"
          )

          tech_ids = ids_for("832", role: "technician", admin: admin)
          assert_includes tech_ids, tech.id
          refute_includes tech_ids, company.id

          company_ids = ids_for("832", role: "company", admin: admin)
          assert_includes company_ids, company.id
          refute_includes company_ids, tech.id
        end

        private

        def create_admin_user!(email)
          User.create!(
            email: email,
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
        end

        def create_technician!(email:, first_name:, last_name:, phone:, trade_type:, zip_code: nil)
          user = User.create!(
            email: email,
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            first_name: first_name,
            last_name: last_name,
            phone: phone
          )
          profile = TechnicianProfile.create!(
            user: user,
            trade_type: trade_type,
            availability: "Full-time",
            phone: phone
          )
          profile.update_columns(zip_code: zip_code) if zip_code.present?
          user
        end

        def create_company_user!(email:, first_name:, last_name:, phone:, company_name:)
          user = User.create!(
            email: email,
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            first_name: first_name,
            last_name: last_name,
            phone: phone
          )
          CompanyProfile.create!(
            user: user,
            company_name: company_name,
            phone: phone,
            bio: "Search fixture"
          )
          user
        end

        def ids_for(query, role: nil, admin: nil)
          actor = admin || User.find_by(role: :admin) || create_admin_user!("admin-index-search-fallback@example.com")
          params = { q: query }
          params[:role] = role if role
          get "/api/v1/admin/users", params: params, headers: auth_header_for(actor)
          assert_response :ok
          JSON.parse(response.body).fetch("users").map { |row| row.fetch("id") }
        end
      end
    end
  end
end
