# frozen_string_literal: true

require "test_helper"
require_relative "../support/ai_sms_test_helper"

class AiInboundSmsProcessorTest < ActiveSupport::TestCase
  include AiSmsTestHelper

  setup do
    @user = create_ai_tech!(email: "ai-in@example.com", contact_id: "contact-in")
    @session = AiSmsSession.create!(
      user: @user,
      purpose: "technician_verification",
      status: "waiting_for_reply",
      started_at: Time.current,
      ghl_contact_id: "contact-in"
    )
    stub_ai!(
      "reply" => "Thanks — I saved that. Please send the license photo and title.",
      "needs_human" => false,
      "actions" => [{ "type" => "no_action" }]
    )
  end

  teardown do
    Ai::Client.reset_adapter!
  end

  test "unknown contact does not invoke AI" do
    called = false
    Ai::TechnicianVerificationAgent.stub(:call, ->(**) { called = true; raise "should not run" }) do
      result = Ai::InboundSmsProcessor.call(
        ghl_contact_id: "missing",
        ghl_message_id: "m-unknown",
        body: "hello",
        direction: "inbound"
      )
      assert result.ignored
      assert_equal "unknown_contact", result.body[:reason]
    end
    refute called
  end

  test "non-active session does not invoke AI" do
    @session.update!(status: "paused")
    result = Ai::InboundSmsProcessor.call(
      ghl_contact_id: "contact-in",
      ghl_message_id: "m-paused",
      body: "hello",
      direction: "inbound"
    )
    assert result.ignored
    assert_equal "no_active_session", result.body[:reason]
  end

  test "duplicate GHL message webhook is ignored" do
    Ghl::SmsSender.stub(:call, sent_sms(id: "out-1")) do
      first = Ai::InboundSmsProcessor.call(inbound_payload("m-dup", "I have a license"))
      second = Ai::InboundSmsProcessor.call(inbound_payload("m-dup", "I have a license"))
      assert first.ok
      assert_equal true, second.duplicate
    end
    assert_equal 1, @session.turns.where(direction: "inbound").where(ghl_message_id: "m-dup").count
  end

  test "outbound messages do not trigger AI" do
    result = Ai::InboundSmsProcessor.call(
      ghl_contact_id: "contact-in",
      ghl_message_id: "m-out",
      body: "admin text",
      direction: "outbound"
    )
    assert result.ignored
    assert_equal "outbound_message", result.body[:reason]
  end

  test "STOP opts out and does not send" do
    sent = false
    Ghl::SmsSender.stub(:call, ->(**) { sent = true; sent_sms }) do
      result = Ai::InboundSmsProcessor.call(inbound_payload("m-stop", "STOP"))
      assert result.ok
      assert_equal "opted_out", @session.reload.status
    end
    refute sent
  end

  test "says no persists N/A then skips license" do
    stub_ai!(
      "reply" => "Got it. I still need 3 professional references.",
      "needs_human" => false,
      "actions" => [{ "type" => "set_trade_credential_presence", "has_trade_credential" => false }]
    )
    Ghl::SmsSender.stub(:call, sent_sms(id: "out-no")) do
      Ai::InboundSmsProcessor.call(inbound_payload("m-no", "No, I don't have a license"))
    end
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal "na", snap[:trade_license][:state]
  end

  test "multiple references in one SMS are parsed from structured actions" do
    stub_ai!(
      "reply" => "Saved both. I still need 1 more professional reference.",
      "needs_human" => false,
      "actions" => [
        { "type" => "save_professional_reference", "full_name" => "Ref One", "email" => "one@example.com", "phone" => "7135553001", "company" => "Co 1" },
        { "type" => "save_professional_reference", "full_name" => "Ref Two", "email" => "two@example.com", "phone" => "7135553002", "company" => "Co 2" }
      ]
    )
    Ghl::SmsSender.stub(:call, sent_sms(id: "out-refs")) do
      Ai::InboundSmsProcessor.call(inbound_payload("m-refs", "Ref One at Co 1, 7135553001, one@example.com. Ref Two at Co 2, 7135553002, two@example.com."))
    end
    assert_equal 2, @user.verification_references_as_technician.count
  end

  test "license yes plus image uses canonical attacher" do
    stub_ai!(
      "reply" => "Got the photo. What is the credential title?",
      "needs_human" => false,
      "actions" => [{ "type" => "no_action" }]
    )
    GhlRemoteImageFetcher.stub(:fetch, fetched_png) do
      Ghl::SmsSender.stub(:call, sent_sms(id: "out-img")) do
        Ai::InboundSmsProcessor.call(
          inbound_payload("m-img", "here you go").merge("attachments" => ["https://services.msgsndr.com/mms/photo.png"])
        )
      end
    end
    snap = TechnicianVerificationInventory.call(@user.reload)
    assert_equal true, snap[:trade_license][:documents].first[:has_file]
  end

  test "unsupported attachment is not stored" do
    GhlRemoteImageFetcher.stub(:fetch, proc { raise GhlRemoteImageFetcher::Error, "file is not an allowed image type" }) do
      Ghl::SmsSender.stub(:call, sent_sms(id: "out-bad")) do
        Ai::InboundSmsProcessor.call(
          inbound_payload("m-bad", "photo").merge("attachments" => ["https://services.msgsndr.com/mms/file.heic"])
        )
      end
    end
    assert_equal 0, @user.technician_profile.documents.count
  end

  private

  def inbound_payload(message_id, body)
    {
      "ghl_contact_id" => "contact-in",
      "ghl_conversation_id" => "conv-in",
      "ghl_message_id" => message_id,
      "body" => body,
      "direction" => "inbound",
      "channel" => "SMS"
    }
  end
end
