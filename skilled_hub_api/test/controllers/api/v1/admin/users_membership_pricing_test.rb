require "test_helper"

module Api
  module V1
    module Admin
      class UsersMembershipPricingTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin can update company membership pricing overrides" do
          admin = User.create!(
            email: "admin-membership-pricing@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0400"
          )
          company_user = User.create!(email: "company-membership-pricing@example.com", password: "password123", password_confirmation: "password123", role: :company)
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic", phone: "713-555-0401")
          company_user.update_column(:company_profile_id, company_profile.id)

          patch "/api/v1/admin/users/#{company_user.id}/membership_pricing",
                params: {
                  membership_level: "premium",
                  membership_fee_override_cents: 0,
                  commission_override_percent: 0,
                  membership_fee_waived: true
                },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "premium", body.dig("membership", "membership_level")
          assert_equal 0, body.dig("membership", "monthly_fee_cents")
          assert_in_delta 10.0, body.dig("membership", "commission_percent").to_f, 0.001
          assert_nil body.dig("membership", "commission_override_percent")
          assert_equal true, body.dig("membership", "membership_fee_waived")
          assert_equal false, body.dig("membership", "job_funding_waived")
          assert_nil company_profile.reload.commission_override_percent
        end

        test "admin can set job_funding_waived separately from monthly waiver" do
          admin = User.create!(
            email: "admin-job-funding-waiver@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0402"
          )
          company_user = User.create!(email: "company-job-funding-waiver@example.com", password: "password123", password_confirmation: "password123", role: :company)
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic", phone: "713-555-0403")
          company_user.update_column(:company_profile_id, company_profile.id)

          patch "/api/v1/admin/users/#{company_user.id}/membership_pricing",
                params: {
                  membership_fee_waived: true,
                  job_funding_waived: true
                },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body.dig("membership", "membership_fee_waived")
          assert_equal true, body.dig("membership", "job_funding_waived")
          assert company_profile.reload.job_funding_waived?
        end

        test "non admin cannot update membership pricing" do
          company_user = User.create!(email: "company-no-admin-membership-pricing@example.com", password: "password123", password_confirmation: "password123", role: :company)
          company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
          company_user.update_column(:company_profile_id, company_profile.id)

          technician = User.create!(email: "technician-no-admin-membership-pricing@example.com", password: "password123", password_confirmation: "password123", role: :technician)
          TechnicianProfile.create!(user: technician, trade_type: "General", availability: "Full-time")

          patch "/api/v1/admin/users/#{company_user.id}/membership_pricing",
                params: { membership_level: "premium" },
                headers: auth_header_for(technician),
                as: :json

          assert_response :forbidden
        end
      end
    end
  end
end
