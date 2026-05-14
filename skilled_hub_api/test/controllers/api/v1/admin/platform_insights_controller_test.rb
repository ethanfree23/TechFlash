# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class PlatformInsightsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper
        include ActiveSupport::Testing::TimeHelpers

        test "open_jobs with ytd period returns job item geo and rate fields" do
          admin = User.create!(
            email: "admin-pi-ytd@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0600"
          )
          company_user = User.create!(
            email: "co-pi-ytd@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "713-555-0601"
          )
          cp = CompanyProfile.create!(
            user: company_user,
            company_name: "PI Test Co",
            phone: "713-555-0602"
          )

          travel_to Time.zone.parse("2026-06-15 12:00:00") do
            Job.create!(
              company_profile: cp,
              title: "YTD insight job",
              description: "Test job for platform insights",
              skill_class: "HVAC",
              status: :open,
              city: "Houston",
              state: "TX",
              location: "Houston, TX",
              hourly_rate_cents: 45_00,
              scheduled_end_at: 1.week.from_now
            )
          end

          get "/api/v1/admin/platform_insights",
            params: { category: "open_jobs", period: "ytd" },
            headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "open_jobs", body["category"]
          assert_equal "ytd", body["period"]
          assert body["since"].present?
          item = body["items"].first
          assert_equal "HVAC", item["skill_class"]
          assert_equal "Houston", item["city"]
          assert_equal "TX", item["state"]
          assert_equal "Houston, TX", item["location"]
          assert_equal 45_00, item["hourly_rate_cents"]
          assert item["scheduled_end_at"].present?
        end

        test "total_jobs with 90d period succeeds" do
          admin = User.create!(
            email: "admin-pi-90d@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0603"
          )

          get "/api/v1/admin/platform_insights",
            params: { category: "total_jobs", period: "90d" },
            headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "90d", body["period"]
        end
      end
    end
  end
end
