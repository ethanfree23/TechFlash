require "test_helper"

module Api
  module V1
    class TechniciansControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "technician can update full address and geocode coordinates" do
        user = User.create!(
          email: "tech-address-update@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          experience_years: 2,
          availability: "Full-time",
          city: "Austin"
        )

        with_stubbed_geocode([29.7604, -95.3698]) do
          patch "/api/v1/technicians/#{profile.id}",
                params: {
                  address: "100 Main St",
                  city: "Houston",
                  state: "Texas",
                  zip_code: "77002",
                  country: "United States"
                },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        profile.reload
        assert_equal "100 Main St", profile.address
        assert_equal "Houston", profile.city
        assert_equal "Texas", profile.state
        assert_equal "77002", profile.zip_code
        assert_equal "United States", profile.country
        assert_equal "Houston, Texas, United States", profile.location
        assert_in_delta 29.7604, profile.latitude.to_f, 0.0001
        assert_in_delta(-95.3698, profile.longitude.to_f, 0.0001)
      end

      private

      def with_stubbed_geocode(return_coords)
        singleton = GeocodingService.singleton_class
        singleton.alias_method :__original_geocode, :geocode
        singleton.define_method(:geocode) { |**_kwargs| return_coords }
        yield
      ensure
        singleton.remove_method :geocode
        singleton.alias_method :geocode, :__original_geocode
        singleton.remove_method :__original_geocode
      end
    end
  end
end
