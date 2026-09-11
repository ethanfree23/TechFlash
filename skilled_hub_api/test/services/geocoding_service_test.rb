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
        GeocodingService.stub(:geocode_zip_centroid, nil) do
          assert_nil GeocodingService.geocode(address: "100 Main", city: "Houston", state: "TX", zip_code: "77002", country: "United States")
        end
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
          GeocodingService.stub(:geocode_zip_centroid, nil) do
            GeocodingService.geocode(address: "17059 Marie Village Dr", city: "Conroe", state: "Texas", zip_code: "77306", country: "United States")
          end
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

  test "zip only uses postal_code geocode and skips street query" do
    street_calls = 0
    zip_calls = 0
    GeocodingService.stub(:google_geocode, ->(**_) { street_calls += 1; nil }) do
      GeocodingService.stub(:nominatim_geocode, ->(**_) { street_calls += 1; nil }) do
        GeocodingService.stub(:geocode_zip_centroid, ->(zip, country: nil) {
          zip_calls += 1
          assert_equal "77002", zip
          [29.7604, -95.3698]
        }) do
          coords = GeocodingService.geocode(address: "", city: "", zip_code: "77002", country: "United States")
          assert_in_delta 29.7604, coords[0], 0.0001
          assert_in_delta(-95.3698, coords[1], 0.0001)
        end
      end
    end
    assert_equal 0, street_calls
    assert_equal 1, zip_calls
  end

  test "google zip geocode request uses postal_code component without address" do
    captured_uri = nil
    fake_res = Object.new
    fake_res.define_singleton_method(:is_a?) { |klass| klass == Net::HTTPSuccess }
    fake_res.define_singleton_method(:body) {
      { "status" => "OK", "results" => [{ "geometry" => { "location" => { "lat" => 29.7604, "lng" => -95.3698 } } }] }.to_json
    }

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
        coords = GeocodingService.geocode(address: nil, city: nil, zip_code: "77002-1234", country: "United States")
        assert_in_delta 29.7604, coords[0], 0.0001
        assert_in_delta(-95.3698, coords[1], 0.0001)
      end
    end

    assert captured_uri.present?
    query = URI.decode_www_form(captured_uri.split("?", 2).last).to_h
    assert_includes query["components"], "postal_code:77002"
    assert_includes query["components"], "country:US"
    refute query.key?("address")
  end

  test "street geocode failure falls back to zip centroid" do
    GeocodingService.stub(:google_maps_api_key, "test-key") do
      GeocodingService.stub(:google_geocode, nil) do
        GeocodingService.stub(:nominatim_geocode, nil) do
          GeocodingService.stub(:geocode_zip_centroid, [29.76, -95.36]) do
            coords = GeocodingService.geocode(
              address: "999 No Such St",
              city: "Houston",
              zip_code: "77002",
              country: "United States"
            )
            assert_in_delta 29.76, coords[0], 0.01
            assert_in_delta(-95.36, coords[1], 0.01)
          end
        end
      end
    end
  end

  test "zip-only google address components are accepted" do
    parsed = GeocodingService.parse_google_address_components(
      [
        { "long_name" => "77002", "short_name" => "77002", "types" => ["postal_code"] },
        { "long_name" => "United States", "short_name" => "US", "types" => ["country"] }
      ],
      "77002, USA"
    )
    assert_equal "77002", parsed["zip_code"]
    assert_equal "", parsed["address"]
    assert_equal "United States", parsed["country"]
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
