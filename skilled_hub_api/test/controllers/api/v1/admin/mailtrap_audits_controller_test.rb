# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class MailtrapAuditsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin can fetch mailtrap audit payload" do
          admin = User.create!(
            email: "admin-mail-audit@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin
          )

          get "/api/v1/admin/mailtrap_audit", headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert body["mail_delivery"].is_a?(Hash)
          assert body["live_automations"].is_a?(Array)
          assert body["inactive_automations"].is_a?(Array)
          assert body["live_automations"].any? { |item| item["key"] == "welcome_email" }
          assert body["manual_emails"].is_a?(Array)
          assert body["manual_emails"].any? { |item| item["key"] == "crm_sales_call_follow_up" }
          refute body["live_automations"].any? { |item| item["key"] == "crm_sales_call_follow_up" }
        end

        test "non admin cannot fetch mailtrap audit payload" do
          company = User.create!(
            email: "company-mail-audit@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          CompanyProfile.create!(user: company, company_name: "Audit Co")

          get "/api/v1/admin/mailtrap_audit", headers: auth_header_for(company)

          assert_response :forbidden
        end
      end
    end
  end
end
