# frozen_string_literal: true

require "test_helper"
require "digest"

class GeocodingServiceTest < ActiveSupport::TestCase
  setup do
    Rails.cache.clear
  end

  test "google response with nil lat lng does not become 0,0" do
    fake_http = fake_google_http_response(
      "status" => "OK",
      "results" => [{ "geometry" => { "location" => { "lat" => nil, "lng" => nil }, "location_type" => "ROOFTOP" } }]
    )
    GeocodingService.stub(:google_maps_api_key, "test-key") do
      Net::HTTP.stub(:new, fake_http) do
        GeocodingService.stub(:nominatim_geocode, nil) do
          assert_nil GeocodingService.geocode(address: "1 Main", city: "Houston", country: "United States")
        end
      end
    end
  end

  test "google response with 0,0 is rejected" do
    fake_http = fake_google_http_response(
      "status" => "OK",
      "results" => [{ "geometry" => { "location" => { "lat" => 0.0, "lng" => 0.0 }, "location_type" => "ROOFTOP" } }]
    )
    GeocodingService.stub(:google_maps_api_key, "test-key") do
      Net::HTTP.stub(:new, fake_http) do
        GeocodingService.stub(:nominatim_geocode, nil) do
          assert_nil GeocodingService.geocode(address: "1 Main", city: "Houston", country: "United States")
        end
      end
    end
  end

  test "nil provider coordinates do not become 0,0" do
    GeocodingService.stub(:google_maps_api_key, nil) do
      GeocodingService.stub(:nominatim_geocode, [nil, nil]) do
        assert_nil GeocodingService.geocode(address: "100 Main", city: "Houston", state: "TX", zip_code: "77002", country: "United States")
      end
    end
  end

  test "malformed provider coordinates are rejected" do
    GeocodingService.stub(:google_maps_api_key, nil) do
      GeocodingService.stub(:nominatim_geocode, ["abc", "def"]) do
        assert_nil GeocodingService.geocode(address: "100 Main", city: "Houston", country: "United States")
      end
    end
  end

  test "provider 0,0 is rejected and not cached" do
    GeocodingService.stub(:google_maps_api_key, nil) do
      GeocodingService.stub(:nominatim_geocode, [0.0, 0.0]) do
        assert_nil GeocodingService.geocode(address: "Null Island", city: "Houston", country: "United States")
      end
    end
    cached = Rails.cache.read("geocode:v3:#{Digest::SHA256.hexdigest("null island, houston, united states")}")
    assert_nil cached
  end

  test "google geocode request constrains country only" do
    captured_uri = nil
    fake_res = Object.new
    fake_res.define_singleton_method(:is_a?) { |klass| klass == Net::HTTPSuccess }
    fake_res.define_singleton_method(:body) { { "status" => "ZERO_RESULTS", "results" => [] }.to_json }

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:request) do |req|
      captured_uri = req.path
      fake_res
    end

    GeocodingService.stub(:google_maps_api_key, "test-key") do
      Net::HTTP.stub(:new, fake_http) do
        GeocodingService.stub(:nominatim_geocode, nil) do
          GeocodingService.geocode(address: "17059 Marie Village Dr", city: "Conroe", state: "Texas", zip_code: "77306", country: "United States")
        end
      end
    end

    assert captured_uri.present?
    query = URI.decode_www_form(captured_uri.split("?", 2).last).to_h
    assert_equal "country:US", query["components"]
    refute_includes query["components"].to_s, "administrative_area"
    refute_includes query["components"].to_s, "postal_code"
    assert_includes query["address"], "Marie Village"
  end

  test "valid nominatim coordinates are returned" do
    GeocodingService.stub(:google_maps_api_key, nil) do
      GeocodingService.stub(:nominatim_geocode, [30.3113, -95.456]) do
        coords = GeocodingService.geocode(address: "100 Main", city: "Conroe", state: "TX", country: "United States")
        assert_in_delta 30.3113, coords[0], 0.0001
        assert_in_delta(-95.456, coords[1], 0.0001)
      end
    end
  end

  private

  def fake_google_http_response(payload)
    fake_res = Object.new
    fake_res.define_singleton_method(:is_a?) { |klass| klass == Net::HTTPSuccess }
    fake_res.define_singleton_method(:body) { payload.to_json }

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:request) { |_| fake_res }
    fake_http
  end
end
