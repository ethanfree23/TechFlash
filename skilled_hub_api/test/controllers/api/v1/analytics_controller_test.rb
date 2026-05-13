# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class AnalyticsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "admin analytics includes trends and admins_count" do
        admin = User.create!(
          email: "admin-analytics-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )

        get "/api/v1/dashboard/analytics", headers: auth_header_for(admin), as: :json

        assert_response :ok
        body = response.parsed_body
        assert_equal User.admin.count, body["admins_count"]
        assert_kind_of Array, body["trends_last_30d"]
        assert_equal 30, body["trends_last_30d"].length
        row = body["trends_last_30d"].first
        assert_includes row.keys, "date"
        assert_includes row.keys, "users_created"
        assert_includes row.keys, "jobs_created"
        assert_includes row.keys, "applications_created"
      end

      test "company analytics includes jobs_created_by_day spine" do
        company_user = User.create!(
          email: "company-analytics-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "basic"
        )
        company_user.update_column(:company_profile_id, company_profile.id)

        get "/api/v1/dashboard/analytics", headers: auth_header_for(company_user), as: :json

        assert_response :ok
        body = response.parsed_body
        assert_kind_of Array, body["jobs_created_by_day"]
        assert_equal 30, body["jobs_created_by_day"].length
        assert body["jobs_created_by_day"].first.key?("date")
        assert body["jobs_created_by_day"].first.key?("count")
      end

      test "technician analytics includes released_earnings_by_day spine" do
        tech_user = User.create!(
          email: "tech-analytics-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: tech_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )

        get "/api/v1/dashboard/analytics", headers: auth_header_for(tech_user), as: :json

        assert_response :ok
        body = response.parsed_body
        assert_kind_of Array, body["released_earnings_by_day"]
        assert_equal 30, body["released_earnings_by_day"].length
        assert body["released_earnings_by_day"].first.key?("date")
        assert body["released_earnings_by_day"].first.key?("amount_cents")
      end
    end
  end
end
