# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class EmailQaControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          ActionMailer::Base.deliveries.clear
        end

        test "admin can list templates" do
          admin = create_admin!("qa-admin-list@example.com")

          get "/api/v1/admin/email_qa/templates", headers: auth_header_for(admin)

          assert_response :ok
          body = JSON.parse(response.body)
          assert body["templates"].is_a?(Array)
          assert body["templates"].any? { |row| row["key"] == "welcome_email" }
        end

        test "admin can preview template" do
          admin = create_admin!("qa-admin-preview@example.com")

          post "/api/v1/admin/email_qa/preview",
               params: { template_key: "welcome_email" },
               headers: auth_header_for(admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "welcome_email", body["template_key"]
          assert_match(/welcome/i, body["subject"])
          assert body["audience"].present?
          assert body["trigger"].present?
        end

        test "admin can preview crm sales call follow-up template" do
          admin = create_admin!("qa-admin-crm-preview@example.com", first_name: "Ethan")

          post "/api/v1/admin/email_qa/preview",
               params: { template_key: "crm_sales_call_follow_up" },
               headers: auth_header_for(admin),
               as: :json

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "crm_sales_call_follow_up", body["template_key"]
          assert_match(/TechFlash|speaking/i, body["subject"].to_s)
          assert body["html_body"].present?
        end

        test "send one requires confirmation guard" do
          admin = create_admin!("qa-admin-confirm@example.com")

          post "/api/v1/admin/email_qa/send",
               params: { template_key: "welcome_email", confirmation: "WRONG" },
               headers: auth_header_for(admin),
               as: :json

          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_match(/confirmation/i, body["error"].to_s)
        end

        test "send one delivers to current admin only" do
          admin = create_admin!("qa-admin-send@example.com")
          create_admin!("qa-other-admin@example.com")
          with_mail_env do
            post "/api/v1/admin/email_qa/send",
                 params: {
                   template_key: "job_issue_report",
                   confirmation: EmailQaRunner::CONFIRMATION_TEXT
                 },
                 headers: auth_header_for(admin),
                 as: :json
          end

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body["delivered"]
          assert_equal [admin.email], body["to"]
          assert_equal 1, ActionMailer::Base.deliveries.size
          assert_equal [admin.email], ActionMailer::Base.deliveries.last.to
        end

        test "send one can deliver to optional to_email" do
          admin = create_admin!("qa-admin-override@example.com")
          other = "other-inbox@example.com"
          with_mail_env do
            post "/api/v1/admin/email_qa/send",
                 params: {
                   template_key: "welcome_email",
                   confirmation: EmailQaRunner::CONFIRMATION_TEXT,
                   to_email: other
                 },
                 headers: auth_header_for(admin),
                 as: :json
          end

          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal true, body["delivered"]
          assert_equal [other], body["to"]
          assert_equal 1, ActionMailer::Base.deliveries.size
          assert_equal [other], ActionMailer::Base.deliveries.last.to
        end

        test "send one rejects invalid to_email" do
          admin = create_admin!("qa-admin-bad-to@example.com")
          with_mail_env do
            post "/api/v1/admin/email_qa/send",
                 params: {
                   template_key: "welcome_email",
                   confirmation: EmailQaRunner::CONFIRMATION_TEXT,
                   to_email: "not-an-email"
                 },
                 headers: auth_header_for(admin),
                 as: :json
          end

          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_match(/invalid|email/i, body["error"].to_s)
        end

        test "send all returns per-template results" do
          admin = create_admin!("qa-admin-send-all@example.com")

          with_mail_env do
            post "/api/v1/admin/email_qa/send_all",
                 params: { confirmation: EmailQaRunner::CONFIRMATION_TEXT },
                 headers: auth_header_for(admin),
                 as: :json
          end

          assert_response :ok
          body = JSON.parse(response.body)
          assert body["results"].is_a?(Array)
          assert body["results"].any? { |row| row["template_key"] == "welcome_email" }
          assert body["results"].all? { |row| row["delivered"] == true }
        end

        test "non admin cannot access email qa endpoints" do
          user = User.create!(
            email: "qa-company-blocked@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :company
          )
          CompanyProfile.create!(user: user, company_name: "Blocked Co")

          get "/api/v1/admin/email_qa/templates", headers: auth_header_for(user)

          assert_response :forbidden
        end

        private

        def create_admin!(email, first_name: nil)
          User.create!(
            email: email,
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0600",
            first_name: first_name
          )
        end

        def with_mail_env
          old_use_http = ENV["MAILTRAP_USE_HTTP"]
          old_token = ENV["MAILTRAP_API_TOKEN"]
          ENV["MAILTRAP_USE_HTTP"] = "true"
          ENV["MAILTRAP_API_TOKEN"] = "test-token"
          yield
        ensure
          ENV["MAILTRAP_USE_HTTP"] = old_use_http
          ENV["MAILTRAP_API_TOKEN"] = old_token
        end
      end
    end
  end
end
