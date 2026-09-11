# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersProfileJobAlertTradeTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "updating technician trade_type syncs job alert trade from the primary type" do
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
          TechnicianProfile.create!(user: technician, trade_type: "General Laborer / Helper", phone: "713-555-0401")
          technician.reload
          assert_equal "General Laborer / Helper", technician.job_alert_preference&.trade_label

          patch "/api/v1/admin/users/#{technician.id}/profile",
                params: { trade_type: "Electrician" },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          technician.reload
          assert_equal "Electrician", technician.technician_profile.trade_type
          assert_equal "Electrician", technician.job_alert_preference&.trade_label
        end

        test "job_alert_trade_label does not override the technician primary trade type" do
          admin = User.create!(
            email: "admin-job-alert-clear@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
          technician = User.create!(
            email: "tech-job-alert-clear@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :technician,
            phone: "713-555-0501"
          )
          TechnicianProfile.create!(user: technician, trade_type: "Plumber", phone: "713-555-0501")
          technician.reload
          assert_equal "Plumber", technician.job_alert_preference&.trade_label

          patch "/api/v1/admin/users/#{technician.id}/profile",
                params: { job_alert_trade_label: "Electrician" },
                headers: auth_header_for(admin),
                as: :json

          assert_response :ok
          technician.reload
          assert_equal "Plumber", technician.technician_profile.trade_type
          assert_equal "Plumber", technician.job_alert_preference&.trade_label
        end
      end
    end
  end
end
