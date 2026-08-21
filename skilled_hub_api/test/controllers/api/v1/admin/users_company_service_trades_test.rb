# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersCompanyServiceTradesTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin can set Auto Shop industry and automobile service trades" do
          admin = User.create!(
            email: "admin-auto-shop-profile@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0600"
          )
          company = User.create!(
            email: "company-auto-shop-profile@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company,
            phone: "254-555-0601"
          )
          profile = CompanyProfile.create!(
            user: company,
            company_name: "Shop Co",
            industry: "General Contracting",
            membership_level: "basic",
            phone: "254-555-0601",
            service_trades: []
          )
          company.update_column(:company_profile_id, profile.id)

          patch "/api/v1/admin/users/#{company.id}/profile",
                params: {
                  industry: "Auto Shop",
                  service_trades: ["Automobile Technician"]
                },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          profile.reload
          assert_equal "Auto Shop", profile.industry
          assert_equal ["Automobile Technician"], profile.service_trades
        end
      end
    end
  end
end
