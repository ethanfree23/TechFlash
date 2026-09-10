# frozen_string_literal: true

require "test_helper"

class GhlRemoteImageFetcherTest < ActiveSupport::TestCase
  MINI_PNG = Base64.decode64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  ).b

  test "downloads a png and returns an attachable io" do
    with_public_dns do
      stub_http_response(body: MINI_PNG, content_type: "image/png") do
        result = GhlRemoteImageFetcher.fetch("https://cdn.example.com/photo.png")
        assert_equal "image/png", result.content_type
        assert_equal MINI_PNG.bytesize, result.bytesize
        assert_equal MINI_PNG, result.io.read.b
      end
    end
  end

  test "downloads a webp even when content-type is wrong" do
    webp = "RIFF".b + "\x08\x00\x00\x00".b + "WEBP".b + "xxxx".b
    with_public_dns do
      stub_http_response(body: webp, content_type: "application/octet-stream") do
        result = GhlRemoteImageFetcher.fetch("https://cdn.example.com/photo.webp")
        assert_equal "image/webp", result.content_type
      end
    end
  end

  test "rejects html even if content-type claims image" do
    with_public_dns do
      stub_http_response(body: "<html><body>nope</body></html>", content_type: "image/jpeg") do
        error = assert_raises(GhlRemoteImageFetcher::Error) do
          GhlRemoteImageFetcher.fetch("https://cdn.example.com/photo.jpg")
        end
        assert_match(/not an allowed image/i, error.message)
      end
    end
  end

  test "rejects svg" do
    with_public_dns do
      svg = %(<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>)
      stub_http_response(body: svg, content_type: "image/svg+xml") do
        assert_raises(GhlRemoteImageFetcher::Error) do
          GhlRemoteImageFetcher.fetch("https://cdn.example.com/photo.svg")
        end
      end
    end
  end

  test "rejects oversized images via content-length" do
    with_public_dns do
      res = fake_success(body: MINI_PNG, content_type: "image/png")
      res.define_singleton_method(:[]) { |key| key.to_s.downcase == "content-length" ? (GhlRemoteImageFetcher::MAX_BYTES + 1).to_s : "image/png" }
      stub_http(res) do
        error = assert_raises(GhlRemoteImageFetcher::Error) do
          GhlRemoteImageFetcher.fetch("https://cdn.example.com/huge.png")
        end
        assert_match(/too large/i, error.message)
      end
    end
  end

  test "rejects private and loopback hosts" do
    Resolv.stub(:getaddresses, ["127.0.0.1"]) do
      Net::HTTP.stub(:new, ->(*) { flunk "must not connect to loopback" }) do
        error = assert_raises(GhlRemoteImageFetcher::Error) do
          GhlRemoteImageFetcher.fetch("https://localhost/photo.png")
        end
        assert_match(/not allowed/i, error.message)
      end
    end
  end

  test "rejects file urls" do
    error = assert_raises(GhlRemoteImageFetcher::Error) do
      GhlRemoteImageFetcher.fetch("file:///etc/passwd")
    end
    assert_match(/http or https/i, error.message)
  end

  test "rejects redirects onto private addresses" do
    redirect = Net::HTTPFound.new("1.1", "302", "Found")
    redirect.define_singleton_method(:[] ) { |key| key.to_s.downcase == "location" ? "http://127.0.0.1/secret" : nil }
    redirect.define_singleton_method(:body) { "" }

    calls = 0
    Resolv.stub(:getaddresses, lambda { |host|
      host.to_s.include?("127.0.0.1") ? ["127.0.0.1"] : ["1.2.3.4"]
    }) do
      fake_http = Object.new
      fake_http.define_singleton_method(:use_ssl=) { |_| }
      fake_http.define_singleton_method(:open_timeout=) { |_| }
      fake_http.define_singleton_method(:read_timeout=) { |_| }
      fake_http.define_singleton_method(:max_retries=) { |_| }
      fake_http.define_singleton_method(:request) do |_|
        calls += 1
        flunk "must not follow redirect to loopback" if calls > 1
        redirect
      end
      Net::HTTP.stub(:new, fake_http) do
        error = assert_raises(GhlRemoteImageFetcher::Error) do
          GhlRemoteImageFetcher.fetch("https://cdn.example.com/photo.png")
        end
        assert_match(/not allowed/i, error.message)
      end
    end
  end

  private

  def with_public_dns(&block)
    Resolv.stub(:getaddresses, ["1.2.3.4"], &block)
  end

  def stub_http_response(body:, content_type:, &block)
    stub_http(fake_success(body: body, content_type: content_type), &block)
  end

  def stub_http(response)
    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:max_retries=) { |_| }
    fake_http.define_singleton_method(:request) { |_| response }
    Net::HTTP.stub(:new, fake_http) { yield }
  end

  def fake_success(body:, content_type:)
    res = Net::HTTPOK.new("1.1", "200", "OK")
    res.define_singleton_method(:body) { body }
    res.define_singleton_method(:[]) do |key|
      key.to_s.downcase == "content-type" ? content_type : nil
    end
    res
  end
end
