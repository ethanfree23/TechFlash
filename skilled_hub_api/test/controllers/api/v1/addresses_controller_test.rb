# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class AddressesControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def with_stubbed_address_suggestions(list)
        orig = GeocodingService.method(:address_suggestions)
        GeocodingService.define_singleton_method(:address_suggestions) { |_q| list }
        yield
      ensure
        GeocodingService.define_singleton_method(:address_suggestions, orig)
      end

      def with_stubbed_google_resolve(value)
        orig = GeocodingService.method(:google_resolve_place)
        GeocodingService.define_singleton_method(:google_resolve_place) { |_id| value }
        yield
      ensure
        GeocodingService.define_singleton_method(:google_resolve_place, orig)
      end

      test "short query returns empty suggestions" do
        user = User.create!(
          email: "addr-suggest-short@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )

        get "/api/v1/address_suggestions?q=ab",
            headers: auth_header_for(user)

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal [], body["suggestions"]
      end

      test "suggestions returns rows from geocoding service" do
        user = User.create!(
          email: "addr-suggest-full@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        fake = [
          {
            "source" => "nominatim",
            "label" => "123 Main St, Houston, TX",
            "address" => "123 Main St",
            "city" => "Houston",
            "state" => "Texas",
            "zip_code" => "77002",
            "country" => "United States"
          }
        ]

        with_stubbed_address_suggestions(fake) do
          get "/api/v1/address_suggestions?q=123+Main+St+Houston",
              headers: auth_header_for(user)
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal 1, body["suggestions"].size
        assert_equal "123 Main St", body["suggestions"].first["address"]
      end

      test "resolve returns unprocessable when google_resolve_place returns nil" do
        user = User.create!(
          email: "addr-resolve@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )

        with_stubbed_google_resolve(nil) do
          get "/api/v1/address_resolve?place_id=ChIJfake",
              headers: auth_header_for(user)
        end

        assert_response :unprocessable_entity
      end

      test "resolve returns json when google_resolve_place succeeds" do
        user = User.create!(
          email: "addr-resolve-ok@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        parsed = {
          "address" => "1 Infinite Loop",
          "city" => "Cupertino",
          "state" => "California",
          "zip_code" => "95014",
          "country" => "United States",
          "formatted" => "1 Infinite Loop, Cupertino, CA 95014, USA"
        }

        with_stubbed_google_resolve(parsed) do
          get "/api/v1/address_resolve?place_id=ChIJfakeok",
              headers: auth_header_for(user)
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "Cupertino", body["city"]
      end
    end
  end
end
