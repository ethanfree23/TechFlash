# frozen_string_literal: true

require "test_helper"

class GhlSmsSenderTest < ActiveSupport::TestCase
  FakeResponse = Struct.new(:ok, :status_code, :body, :error, :retryable, keyword_init: true)

  class FakeClient
    attr_reader :calls

    def initialize(responses)
      @responses = responses
      @calls = []
    end

    def get_contact(id)
      @calls << [:get_contact, id]
      @responses.fetch(:get_contact)
    end

    def upsert_contact(payload)
      @calls << [:upsert_contact, payload]
      @responses.fetch(:upsert_contact)
    end

    def send_sms(contact_id:, message:)
      @calls << [:send_sms, contact_id, message]
      @responses.fetch(:send_sms)
    end
  end

  setup do
    @prev_token = ENV["GHL_PRIVATE_INTEGRATION_TOKEN"]
    @prev_location = ENV["GHL_LOCATION_ID"]
    ENV["GHL_PRIVATE_INTEGRATION_TOKEN"] = "pit-test"
    ENV["GHL_LOCATION_ID"] = "loc-test"
    @user = User.create!(
      email: "sms-user@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "John",
      last_name: "Smith",
      phone: "7135551234"
    )
    TechnicianProfile.create!(user: @user, trade_type: "Plumber", availability: "Full-time", phone: "7135551234")
  end

  teardown do
    ENV["GHL_PRIVATE_INTEGRATION_TOKEN"] = @prev_token
    ENV["GHL_LOCATION_ID"] = @prev_location
  end

  test "reuses existing ghl_contact_id and sends SMS" do
    @user.update_column(:ghl_contact_id, "existing-contact")
    client = FakeClient.new(
      get_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "existing-contact" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: true, status_code: 201, body: { "messageId" => "msg-1", "conversationId" => "conv-1" }, error: nil, retryable: false)
    )

    result = Ghl::SmsSender.call(user: @user, message: "Hello from TechFlash", context: "admin_verification", client: client)

    assert_equal true, result.ok
    assert_equal :sent, result.status
    assert_equal "msg-1", result.provider_message_id
    assert_equal "conv-1", result.conversation_id
    assert_equal "existing-contact", @user.reload.ghl_contact_id
    assert_equal [[:get_contact, "existing-contact"], [:send_sms, "existing-contact", "Hello from TechFlash"]], client.calls
    log = SmsDeliveryLog.find(result.log_id)
    assert_equal "sent", log.status
    assert_equal "ghl", log.provider
    assert_equal "msg-1", log.provider_message_id
    assert_equal "conv-1", log.provider_conversation_id
    assert_equal "admin_verification", log.category
  end

  test "missing contact id upserts and persists the returned id" do
    client = FakeClient.new(
      upsert_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "new-contact" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: true, status_code: 201, body: { "messageId" => "msg-2", "conversationId" => "conv-2" }, error: nil, retryable: false)
    )

    result = Ghl::SmsSender.call(user: @user, message: "Need your references", context: "admin_verification", client: client)

    assert result.ok
    assert_equal "new-contact", @user.reload.ghl_contact_id
    payload = client.calls.assoc(:upsert_contact)[1]
    assert_equal "loc-test", payload[:locationId]
    assert_equal false, payload[:createNewIfDuplicateAllowed]
    assert_equal "John", payload[:firstName]
    assert_equal "+17135551234", payload[:phone]
    refute payload.key?(:blankField)
  end

  test "blank TechFlash fields are omitted from upsert" do
    @user.update_columns(first_name: nil, last_name: "", email: "keep@example.com")
    client = FakeClient.new(
      upsert_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "c1" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: true, status_code: 201, body: { "messageId" => "m" }, error: nil, retryable: false)
    )

    Ghl::SmsSender.call(user: @user, message: "Hi", client: client)
    payload = client.calls.assoc(:upsert_contact)[1]
    refute payload.key?(:firstName)
    refute payload.key?(:lastName)
    assert_equal "keep@example.com", payload[:email]
  end

  test "DND skips without sending and without clearing DND" do
    @user.update_column(:ghl_contact_id, "dnd-contact")
    client = FakeClient.new(
      get_contact: FakeResponse.new(
        ok: true,
        status_code: 200,
        body: { "contact" => { "id" => "dnd-contact", "dndSettings" => { "SMS" => { "status" => "active", "code" => "OPTED_OUT" } } } },
        error: nil,
        retryable: false
      )
    )

    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert_equal false, result.ok
    assert_equal :skipped_opt_out, result.status
    refute client.calls.any? { |call| call.first == :send_sms }
    assert_equal "skipped_opt_out", SmsDeliveryLog.order(:id).last.status
  end

  test "known TechFlash GHL opt-out skips without calling GHL" do
    @user.update_column(:ghl_contact_id, "existing-contact")
    SmsDeliveryLog.create!(
      user: @user,
      category: "admin_verification",
      destination: "+17135551234",
      message: "prior",
      status: "skipped_opt_out",
      provider: "ghl"
    )
    client = FakeClient.new({})

    result = Ghl::SmsSender.call(user: @user, message: "Hello again", client: client)
    assert_equal :skipped_opt_out, result.status
    assert_empty client.calls
  end

  test "invalid phone skips GHL" do
    @user.update_columns(phone: "123")
    @user.technician_profile.update_column(:phone, "123")
    client = FakeClient.new({})
    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert_equal :invalid_phone, result.status
    assert_empty client.calls
  end

  test "401 from send is a failed auth mapping" do
    @user.update_column(:ghl_contact_id, "c")
    client = FakeClient.new(
      get_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "c" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: false, status_code: 401, body: { "message" => "Unauthorized" }, error: "Unauthorized", retryable: false)
    )
    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert_equal :failed, result.status
    assert_equal :bad_gateway, result.http_status
  end

  test "429 is temporary_failure" do
    @user.update_column(:ghl_contact_id, "c")
    client = FakeClient.new(
      get_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "c" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: false, status_code: 429, body: { "message" => "rate limit" }, error: "rate limit", retryable: true)
    )
    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert_equal :temporary_failure, result.status
    assert_equal :service_unavailable, result.http_status
  end

  test "5xx is temporary_failure" do
    @user.update_column(:ghl_contact_id, "c")
    client = FakeClient.new(
      get_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "c" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: false, status_code: 503, body: {}, error: "unavailable", retryable: true)
    )
    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert_equal :temporary_failure, result.status
  end

  test "empty and oversized messages are rejected" do
    client = FakeClient.new({})
    empty = Ghl::SmsSender.call(user: @user, message: "   ", client: client)
    assert_equal false, empty.ok
    assert_match(/required/i, empty.error)

    huge = Ghl::SmsSender.call(user: @user, message: "x" * 1601, client: client)
    assert_equal false, huge.ok
    assert_match(/1600/, huge.error)
    assert_empty client.calls
  end

  test "404 existing contact falls back to upsert" do
    @user.update_column(:ghl_contact_id, "stale")
    client = FakeClient.new(
      get_contact: FakeResponse.new(ok: false, status_code: 404, body: {}, error: "not found", retryable: false),
      upsert_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "fresh" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: true, status_code: 201, body: { "messageId" => "m3" }, error: nil, retryable: false)
    )
    result = Ghl::SmsSender.call(user: @user, message: "Hello", client: client)
    assert result.ok
    assert_equal "fresh", @user.reload.ghl_contact_id
  end

  test "sender works for a company user" do
    company = User.create!(
      email: "sms-co@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Pat",
      last_name: "Lee",
      phone: "8325559999"
    )
    CompanyProfile.create!(user: company, company_name: "Lee Electric", phone: "8325559999")
    client = FakeClient.new(
      upsert_contact: FakeResponse.new(ok: true, status_code: 200, body: { "contact" => { "id" => "co-1" } }, error: nil, retryable: false),
      send_sms: FakeResponse.new(ok: true, status_code: 201, body: { "messageId" => "m-co" }, error: nil, retryable: false)
    )
    result = Ghl::SmsSender.call(user: company, message: "Need techs this week?", context: "company_outreach", client: client)
    assert result.ok
    assert_equal "co-1", company.reload.ghl_contact_id
  end
end
