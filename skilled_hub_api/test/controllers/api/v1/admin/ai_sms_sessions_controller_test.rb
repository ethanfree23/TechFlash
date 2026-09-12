# frozen_string_literal: true

require "test_helper"
require_relative "../../../../support/ai_sms_test_helper"

module Api
  module V1
    module Admin
      class AiSmsSessionsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper
        include AiSmsTestHelper

        setup do
          @admin = User.create!(
            email: "admin-ai-sms@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0500"
          )
          @tech = create_ai_tech!(email: "tech-ai-sms@example.com", contact_id: "contact-admin")
          stub_ai!("reply" => "Hey John — do you currently hold a trade license?", "needs_human" => false, "actions" => [{ "type" => "no_action" }])
        end

        teardown do
          Ai::Client.reset_adapter!
        end

        test "show returns canonical inventory" do
          get "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          assert_equal "unknown", body["inventory"]["trade_license"]["state"]
          assert_equal true, body["technician_actionable"]
        end

        test "start uses Ghl::SmsSender and does not start twice" do
          Ghl::SmsSender.stub(:call, sent_sms) do
            post "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@admin), as: :json
            assert_response :ok
            first_id = JSON.parse(response.body)["session"]["id"]
            post "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@admin), as: :json
            assert_response :ok
            body = JSON.parse(response.body)
            assert_equal true, body["resumed"]
            assert_equal first_id, body["session"]["id"]
          end
        end

        test "pause and end stop the live session" do
          Ghl::SmsSender.stub(:call, sent_sms) do
            post "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@admin), as: :json
          end
          post "/api/v1/admin/users/#{@tech.id}/ai_sms_session/pause", headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert_equal "paused", JSON.parse(response.body)["session"]["status"]

          post "/api/v1/admin/users/#{@tech.id}/ai_sms_session/end_session", headers: auth_header_for(@admin), as: :json
          assert_response :ok
          assert_equal "completed", JSON.parse(response.body)["session"]["status"]
        end

        test "manual SMS remains available while AI is active" do
          Ghl::SmsSender.stub(:call, sent_sms) do
            post "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@admin), as: :json
            post "/api/v1/admin/users/#{@tech.id}/sms",
                 params: { message: "Human takeover note", context: "admin_verification" },
                 as: :json,
                 headers: auth_header_for(@admin)
            assert_response :ok
          end
          assert AiSmsSession.live_for(@tech.reload).present?
        end

        test "technician cannot start AI SMS" do
          post "/api/v1/admin/users/#{@tech.id}/ai_sms_session", headers: auth_header_for(@tech), as: :json
          assert_response :forbidden
        end
      end
    end
  end
end
