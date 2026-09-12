# frozen_string_literal: true

require "test_helper"

class AiSmsSessionTest < ActiveSupport::TestCase
  setup do
    @previous_location = ENV["GHL_LOCATION_ID"]
    ENV["GHL_LOCATION_ID"] = "loc123"
    @user = User.create!(
      email: "ai-session-url@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550198",
      ghl_contact_id: "contact123"
    )
    TechnicianProfile.create!(user: @user, trade_type: "Plumber", availability: "Full-time", phone: "7135550198")
  end

  teardown do
    ENV["GHL_LOCATION_ID"] = @previous_location
  end

  test "conversation url uses current GHL conversations path without /detail/" do
    session = AiSmsSession.create!(
      user: @user,
      purpose: "technician_verification",
      status: "waiting_for_reply",
      started_at: Time.current,
      ghl_contact_id: "contact123",
      ghl_conversation_id: "conv123"
    )

    assert_equal "https://app.gohighlevel.com/v2/location/loc123/conversations/conv123", session.conversation_url
    refute_includes session.conversation_url, "/detail/"
  end

  test "conversation url falls back to contact page when conversation id is missing" do
    session = AiSmsSession.create!(
      user: @user,
      purpose: "technician_verification",
      status: "waiting_for_reply",
      started_at: Time.current,
      ghl_contact_id: "contact123"
    )

    assert_equal "https://app.gohighlevel.com/v2/location/loc123/contacts/detail/contact123", session.conversation_url
  end
end
