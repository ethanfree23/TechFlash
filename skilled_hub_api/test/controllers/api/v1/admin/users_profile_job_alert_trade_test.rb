# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersProfileJobAlertTradeTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin sets job_alert_trade_label when technician has no preference row" do
          admin = User.create!(
            email: "admin-job-alert-trade@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0400"
          )
          technician = User.create!(
            email: "tech-job-alert-trade@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            phone: "713-555-0401"
          )
          TechnicianProfile.create!(user: technician, trade_type: "General", phone: "713-555-0401")
          assert_nil technician.job_alert_preference

          patch "/api/v1/admin/users/#{technician.id}/profile",
                params: { job_alert_trade_label: "Electrician" },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          technician.reload
          assert_equal "Electrician", technician.job_alert_preference&.trade_label
        end
      end
    end
  end
end
