require "test_helper"
require "ostruct"
require "net/http"

class CheckrClientTest < ActiveSupport::TestCase
  test "create_candidate preserves json body when path is normalized to /v1" do
    fake_config = OpenStruct.new(
      requests_allowed?: true,
      requests_block_reason: nil,
      api_key: "sk_test_123",
      default_package: "essential_criminal",
      default_node_custom_id: nil,
      api_base_url: "https://api.checkr.com"
    )

    captured_request = nil
    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response.instance_variable_set(:@body, { id: "cand_1", email: "new.tech@example.com" }.to_json)

    original_config_new = CheckrConfiguration.method(:new)
    original_http_start = Net::HTTP.method(:start)

    CheckrConfiguration.singleton_class.send(:define_method, :new) { fake_config }
    Net::HTTP.singleton_class.send(:define_method, :start) do |_host, _port, use_ssl:, read_timeout:, open_timeout:, &block|
      http = Object.new
      http.define_singleton_method(:request) do |request|
        captured_request = request
        response
      end
      block.call(http)
    end

    client = CheckrClient.new
    user = OpenStruct.new(email: "new.tech@example.com", first_name: "New", last_name: "Tech")
    body = client.create_candidate(
      user: user,
      work_location: { country: "US", state: "TX", city: "Houston" },
      custom_id: "techflash_user_999",
      zipcode: "77002"
    )

    assert_equal "cand_1", body["id"]
    assert_equal "/v1/candidates", captured_request.path
    assert_equal "application/json", captured_request["Content-Type"]
    payload = JSON.parse(captured_request.body)
    assert_equal "new.tech@example.com", payload["email"]
    assert_equal "techflash_user_999", payload["custom_id"]
    assert_equal "Houston", payload["work_locations"][0]["city"]
  ensure
    CheckrConfiguration.singleton_class.send(:define_method, :new, original_config_new)
    Net::HTTP.singleton_class.send(:define_method, :start, original_http_start)
  end
end
