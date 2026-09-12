# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/ai_sms_test_helper"

module Api
  module V1
    class GhlInboundSmsControllerTest < ActionDispatch::IntegrationTest
      include AiSmsTestHelper

      SECRET = "ghl-inbound-secret"

      setup do
        @previous_secret = ENV["GHL_WEBHOOK_SECRET"]
        ENV["GHL_WEBHOOK_SECRET"] = SECRET
        @user = create_ai_tech!(email: "ghl-inbound@example.com", contact_id: "contact-wh")
        @session = AiSmsSession.create!(
          user: @user,
          purpose: "technician_verification",
          status: "waiting_for_reply",
          started_at: Time.current,
          ghl_contact_id: "contact-wh"
        )
        stub_ai!("reply" => "Thanks, send the next item.", "needs_human" => false, "actions" => [{ "type" => "no_action" }])
      end

      teardown do
        ENV["GHL_WEBHOOK_SECRET"] = @previous_secret
        Ai::Client.reset_adapter!
      end

      test "missing bearer is unauthorized" do
        post "/api/v1/webhooks/ghl/inbound_sms", params: { ghl_contact_id: "contact-wh", ghl_message_id: "m1", body: "hi" }, as: :json
        assert_response :unauthorized
      end

      test "authenticated inbound for active session is processed" do
        Ghl::SmsSender.stub(:call, sent_sms) do
          post "/api/v1/webhooks/ghl/inbound_sms",
               params: {
                 ghl_contact_id: "contact-wh",
                 ghl_conversation_id: "conv-wh",
                 ghl_message_id: "m-wh-1",
                 body: "I can send that",
                 direction: "inbound"
               },
               headers: { "Authorization" => "Bearer #{SECRET}" },
               as: :json
        end
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["success"]
      end

      test "onboarding webhook is unchanged" do
        post "/api/v1/webhooks/ghl/technician_onboarding",
             params: { ghl_contact_id: "x" },
             as: :json
        assert_response :unauthorized
      end
    end
  end
end
