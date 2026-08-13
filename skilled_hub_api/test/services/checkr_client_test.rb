require "test_helper"
require "ostruct"
require "net/http"
require "zlib"
require "stringio"

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

  test "list_packages parses utf8 bom prefixed json response" do
    fake_config = OpenStruct.new(
      requests_allowed?: true,
      requests_block_reason: nil,
      api_key: "sk_test_123",
      default_package: "essential_criminal",
      default_node_custom_id: nil,
      api_base_url: "https://api.checkr-staging.com"
    )

    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response["content-type"] = "application/json"
    response.instance_variable_set(:@body, "\xEF\xBB\xBF{\"data\":[{\"id\":\"pkg_1\",\"name\":\"Essential\"}]}")

    original_config_new = CheckrConfiguration.method(:new)
    original_http_start = Net::HTTP.method(:start)

    CheckrConfiguration.singleton_class.send(:define_method, :new) { fake_config }
    Net::HTTP.singleton_class.send(:define_method, :start) do |_host, _port, use_ssl:, read_timeout:, open_timeout:, &block|
      http = Object.new
      http.define_singleton_method(:request) { |_request| response }
      block.call(http)
    end

    client = CheckrClient.new
    packages = client.list_packages

    assert_equal 1, packages.size
    assert_equal "pkg_1", packages.first["id"]
  ensure
    CheckrConfiguration.singleton_class.send(:define_method, :new, original_config_new)
    Net::HTTP.singleton_class.send(:define_method, :start, original_http_start)
  end

  test "list_packages parse errors include response diagnostics" do
    fake_config = OpenStruct.new(
      requests_allowed?: true,
      requests_block_reason: nil,
      api_key: "sk_test_123",
      default_package: "essential_criminal",
      default_node_custom_id: nil,
      api_base_url: "https://api.checkr-staging.com"
    )

    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response["content-type"] = "text/html"
    response.instance_variable_set(:@body, "<!doctype html><html><body>Proxy error</body></html>")

    original_config_new = CheckrConfiguration.method(:new)
    original_http_start = Net::HTTP.method(:start)

    CheckrConfiguration.singleton_class.send(:define_method, :new) { fake_config }
    Net::HTTP.singleton_class.send(:define_method, :start) do |_host, _port, use_ssl:, read_timeout:, open_timeout:, &block|
      http = Object.new
      http.define_singleton_method(:request) { |_request| response }
      block.call(http)
    end

    error = assert_raises(CheckrClient::Error) do
      CheckrClient.new.list_packages
    end

    assert_includes error.message, "status=200"
    assert_includes error.message, "content_type=text/html"
    assert_includes error.message, "body_start="
  ensure
    CheckrConfiguration.singleton_class.send(:define_method, :new, original_config_new)
    Net::HTTP.singleton_class.send(:define_method, :start, original_http_start)
  end

  test "list_packages parses gzip encoded json response" do
    fake_config = OpenStruct.new(
      requests_allowed?: true,
      requests_block_reason: nil,
      api_key: "sk_test_123",
      default_package: "essential_criminal",
      default_node_custom_id: nil,
      api_base_url: "https://api.checkr-staging.com"
    )

    io = StringIO.new
    gz = Zlib::GzipWriter.new(io)
    gz.write({ data: [{ id: "pkg_gzip_1", name: "Essential Gzip" }] }.to_json)
    gz.close

    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response["content-type"] = "application/json"
    response["content-encoding"] = "gzip"
    response.instance_variable_set(:@body, io.string)

    original_config_new = CheckrConfiguration.method(:new)
    original_http_start = Net::HTTP.method(:start)

    CheckrConfiguration.singleton_class.send(:define_method, :new) { fake_config }
    Net::HTTP.singleton_class.send(:define_method, :start) do |_host, _port, use_ssl:, read_timeout:, open_timeout:, &block|
      http = Object.new
      http.define_singleton_method(:request) { |_request| response }
      block.call(http)
    end

    client = CheckrClient.new
    packages = client.list_packages

    assert_equal 1, packages.size
    assert_equal "pkg_gzip_1", packages.first["id"]
  ensure
    CheckrConfiguration.singleton_class.send(:define_method, :new, original_config_new)
    Net::HTTP.singleton_class.send(:define_method, :start, original_http_start)
  end

  test "create_candidate converts full state and country names to ISO codes" do
    captured_request = nil
    with_stubbed_checkr_http(response_body: { id: "cand_2" }) do |request_slot|
      captured_request = request_slot
      user = OpenStruct.new(email: "tech@example.com", first_name: "New", last_name: "Tech")
      CheckrClient.new.create_candidate(
        user: user,
        work_location: { country: "United States", state: "Texas", city: "Houston" },
        custom_id: "techflash_user_1"
      )
    end

    payload = JSON.parse(captured_request[:request].body)
    location = payload["work_locations"][0]
    assert_equal "US", location["country"]
    assert_equal "TX", location["state"]
    assert_equal "Houston", location["city"]

    captured_invitation = nil
    with_stubbed_checkr_http(response_body: { id: "inv_full", invitation_url: "https://example.test/inv" }) do |request_slot|
      captured_invitation = request_slot
      CheckrClient.new.create_invitation(
        candidate_id: "cand_2",
        package_name: "essential_criminal",
        redirect_url: "https://example.test/settings",
        work_location: { country: "United States", state: "Texas", city: "Houston" }
      )
    end

    invitation_location = JSON.parse(captured_invitation[:request].body)["work_locations"][0]
    assert_equal "US", invitation_location["country"]
    assert_equal "TX", invitation_location["state"]
    assert_equal "Houston", invitation_location["city"]
  end

  test "create_candidate and create_invitation pass through 2-letter state and country codes" do
    captured_candidate = nil
    with_stubbed_checkr_http(response_body: { id: "cand_3" }) do |request_slot|
      captured_candidate = request_slot
      user = OpenStruct.new(email: "tech@example.com", first_name: "New", last_name: "Tech")
      CheckrClient.new.create_candidate(
        user: user,
        work_location: { country: "US", state: "TX", city: "Houston" },
        custom_id: "techflash_user_2"
      )
    end

    candidate_location = JSON.parse(captured_candidate[:request].body)["work_locations"][0]
    assert_equal "US", candidate_location["country"]
    assert_equal "TX", candidate_location["state"]

    captured_invitation = nil
    with_stubbed_checkr_http(response_body: { id: "inv_1", invitation_url: "https://example.test/inv" }) do |request_slot|
      captured_invitation = request_slot
      CheckrClient.new.create_invitation(
        candidate_id: "cand_3",
        package_name: "essential_criminal",
        redirect_url: "https://example.test/settings",
        work_location: { country: "us", state: "tx", city: "Houston" }
      )
    end

    invitation_location = JSON.parse(captured_invitation[:request].body)["work_locations"][0]
    assert_equal "US", invitation_location["country"]
    assert_equal "TX", invitation_location["state"]
    assert_equal "Houston", invitation_location["city"]
  end

  private

  def with_stubbed_checkr_http(response_body:)
    fake_config = OpenStruct.new(
      requests_allowed?: true,
      requests_block_reason: nil,
      api_key: "sk_test_123",
      default_package: "essential_criminal",
      default_node_custom_id: nil,
      api_base_url: "https://api.checkr.com"
    )

    request_slot = { request: nil }
    response = Net::HTTPOK.new("1.1", "200", "OK")
    response.instance_variable_set(:@read, true)
    response.instance_variable_set(:@body, response_body.to_json)

    original_config_new = CheckrConfiguration.method(:new)
    original_http_start = Net::HTTP.method(:start)

    CheckrConfiguration.singleton_class.send(:define_method, :new) { fake_config }
    Net::HTTP.singleton_class.send(:define_method, :start) do |_host, _port, use_ssl:, read_timeout:, open_timeout:, &block|
      http = Object.new
      http.define_singleton_method(:request) do |request|
        request_slot[:request] = request
        response
      end
      block.call(http)
    end

    yield request_slot
  ensure
    CheckrConfiguration.singleton_class.send(:define_method, :new, original_config_new)
    Net::HTTP.singleton_class.send(:define_method, :start, original_http_start)
  end
end
