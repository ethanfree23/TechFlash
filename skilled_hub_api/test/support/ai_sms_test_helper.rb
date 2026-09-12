# frozen_string_literal: true

require "test_helper"

class FakeAiAdapter
  attr_accessor :payloads

  def initialize(payloads)
    @payloads = Array(payloads)
  end

  def configured?
    true
  end

  def generate_structured(**_opts)
    payload = @payloads.shift || {
      "reply" => "Thanks — please send the next missing item.",
      "needs_human" => false,
      "actions" => [{ "type" => "no_action" }]
    }
    Ai::Client::Result.new(ok: true, data: payload)
  end
end

class FakeSmsResult < Struct.new(:ok, :status, :error, :destination, :provider_message_id, :conversation_id, :http_status, :log_id, keyword_init: true)
  def as_json(_ = nil)
    { success: ok == true, status: status.to_s, error: error, provider_message_id: provider_message_id, conversation_id: conversation_id }
  end
end

module AiSmsTestHelper
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  def stub_ai!(*payloads)
    Ai::Client.adapter = FakeAiAdapter.new(payloads)
  end

  def sent_sms(id: "msg-ai", conversation_id: "conv-ai", status: :sent, ok: true, error: nil)
    FakeSmsResult.new(
      ok: ok,
      status: status,
      error: error,
      http_status: ok ? :ok : :unprocessable_entity,
      provider_message_id: id,
      conversation_id: conversation_id
    )
  end

  def create_ai_tech!(email:, contact_id: nil)
    user = User.create!(
      email: email,
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "John",
      last_name: "Smith",
      phone: "7135552222",
      ghl_contact_id: contact_id
    )
    TechnicianProfile.create!(user: user, trade_type: "HVAC Technician", availability: "Full-time", phone: "7135552222")
    user
  end

  def fetched_png
    GhlRemoteImageFetcher::Result.new(
      io: StringIO.new(MINI_PNG),
      content_type: "image/png",
      filename: "license.png",
      bytesize: MINI_PNG.bytesize
    )
  end
end
