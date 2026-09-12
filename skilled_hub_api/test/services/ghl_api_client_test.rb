# frozen_string_literal: true

require "test_helper"

class GhlApiClientTest < ActiveSupport::TestCase
  test "uses endpoint-specific Version headers" do
    seen = []
    http = lambda do |method:, uri:, version:, body:, token:|
      seen << { method: method, path: uri.request_uri, version: version, body: body, token: token }
      Ghl::ApiClient::Response.new(ok: true, status_code: 200, body: { "ok" => true }, error: nil, retryable: false)
    end

    client = Ghl::ApiClient.new(token: "pit-test", http: http)
    client.upsert_contact({ locationId: "loc" })
    client.get_contact("abc")
    client.send_sms(contact_id: "abc", message: "Hi")

    assert_equal "v3", seen[0][:version]
    assert_equal "/contacts/upsert", seen[0][:path]
    assert_equal "v3", seen[1][:version]
    assert_match %r{\A/contacts/abc\z}, seen[1][:path]
    assert_equal "2021-07-28", seen[2][:version]
    assert_equal "/conversations/messages", seen[2][:path]
    assert_equal({ type: "SMS", contactId: "abc", message: "Hi" }, seen[2][:body])
  end

  test "retries transient failures a bounded number of times" do
    attempts = 0
    http = lambda do |**_|
      attempts += 1
      Ghl::ApiClient::Response.new(ok: false, status_code: 429, body: {}, error: "rate", retryable: true)
    end
    client = Ghl::ApiClient.new(token: "pit-test", http: http)
    result = client.send_sms(contact_id: "c", message: "Hi")
    assert_equal false, result.ok
    assert_equal 3, attempts
  end

  test "does not retry 401" do
    attempts = 0
    http = lambda do |**_|
      attempts += 1
      Ghl::ApiClient::Response.new(ok: false, status_code: 401, body: {}, error: "no", retryable: false)
    end
    client = Ghl::ApiClient.new(token: "pit-test", http: http)
    result = client.send_sms(contact_id: "c", message: "Hi")
    assert_equal 1, attempts
    assert_equal 401, result.status_code
  end
end
