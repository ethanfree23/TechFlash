require "test_helper"

module Api
  module V1
    class TechniciansControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "admin can merge current technician into selected technician by default" do
        admin = User.create!(
          email: "admin-merge-tech-default@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        current_user = User.create!(
          email: "tech-current-default@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        selected_user = User.create!(
          email: "tech-selected-default@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        current = TechnicianProfile.create!(user: current_user, trade_type: "HVAC", experience_years: 5, availability: "Full-time")
        selected = TechnicianProfile.create!(user: selected_user, trade_type: "HVAC", experience_years: 3, availability: "Part-time")
        SavedJobSearch.create!(technician_profile: current, keyword: "chiller", location: "Dallas", skill_class: "hvac")

        post "/api/v1/technicians/#{current.id}/merge",
             params: {
               target_technician_profile_id: selected.id
             },
             headers: auth_header_for(admin),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal selected.id, body["target_technician_profile_id"]
        assert_equal current.id, body["source_technician_profile_id"]
        assert_equal "into_target", body["merge_direction"]

        assert_nil TechnicianProfile.find_by(id: current.id)
        assert_not_nil TechnicianProfile.find_by(id: selected.id)
        assert_equal selected.id, SavedJobSearch.find_by(keyword: "chiller")&.technician_profile_id
      end

      test "admin can merge selected technician into current technician" do
        admin = User.create!(
          email: "admin-merge-tech@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        current_user = User.create!(
          email: "tech-current@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        selected_user = User.create!(
          email: "tech-selected@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        current = TechnicianProfile.create!(user: current_user, trade_type: "HVAC", experience_years: 5, availability: "Full-time")
        selected = TechnicianProfile.create!(user: selected_user, trade_type: "HVAC", experience_years: 3, availability: "Part-time")
        SavedJobSearch.create!(technician_profile: selected, keyword: "boiler", location: "Austin", skill_class: "hvac")

        post "/api/v1/technicians/#{current.id}/merge",
             params: {
               target_technician_profile_id: selected.id,
               merge_direction: "into_current"
             },
             headers: auth_header_for(admin),
             as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal current.id, body["target_technician_profile_id"]
        assert_equal selected.id, body["source_technician_profile_id"]
        assert_equal "into_current", body["merge_direction"]

        assert_nil TechnicianProfile.find_by(id: selected.id)
        assert_not_nil TechnicianProfile.find_by(id: current.id)
        assert_equal current.id, SavedJobSearch.find_by(keyword: "boiler")&.technician_profile_id
      end

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
