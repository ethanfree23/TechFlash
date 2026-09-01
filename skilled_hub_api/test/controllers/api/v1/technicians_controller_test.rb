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
          phone: "713-555-0300",
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
        assert_equal "success", profile.geocode_status
      end

      test "places coordinates are stored without a second geocode request" do
        user = User.create!(
          email: "tech-places-coords@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0400"
        )
        geocode_calls = 0
        GeocodingService.stub(:geocode, ->(**_) { geocode_calls += 1; [1.0, 1.0] }) do
          patch "/api/v1/technicians/#{profile.id}",
                params: {
                  address: "100 Main St",
                  city: "Houston",
                  state: "Texas",
                  zip_code: "77002",
                  country: "United States",
                  latitude: 29.7604,
                  longitude: -95.3698,
                  place_id: "ChIJtestplace"
                },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        profile.reload
        assert_equal 0, geocode_calls
        assert_in_delta 29.7604, profile.latitude.to_f, 0.0001
        assert_in_delta(-95.3698, profile.longitude.to_f, 0.0001)
        assert_equal "ChIJtestplace", profile.place_id
        assert_equal "success", profile.geocode_status
        assert profile.map_ready?
      end

      test "manual address without client coordinates invokes server geocoding" do
        user = User.create!(
          email: "tech-manual-geocode@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0401"
        )
        geocode_calls = 0
        GeocodingService.stub(:geocode, ->(**_) { geocode_calls += 1; [30.3113, -95.456] }) do
          patch "/api/v1/technicians/#{profile.id}",
                params: {
                  address: "1 Test St",
                  city: "Conroe",
                  state: "Texas",
                  zip_code: "77301",
                  country: "United States"
                },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        profile.reload
        assert_equal 1, geocode_calls
        assert_in_delta 30.3113, profile.latitude.to_f, 0.0001
        assert_in_delta(-95.456, profile.longitude.to_f, 0.0001)
      end

      test "address change plus geocode failure clears stale coordinates" do
        user = User.create!(
          email: "tech-stale-coords@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0402"
        )
        profile.update_columns(
          address: "Old Houston St",
          city: "Houston",
          state: "Texas",
          zip_code: "77002",
          country: "United States",
          latitude: 29.7604,
          longitude: -95.3698,
          geocode_status: "success"
        )

        with_stubbed_geocode(nil) do
          patch "/api/v1/technicians/#{profile.id}",
                params: {
                  address: "1 Conroe St",
                  city: "Conroe",
                  state: "Texas",
                  zip_code: "77301",
                  country: "United States"
                },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        profile.reload
        assert_equal "Conroe", profile.city
        assert_nil profile.latitude
        assert_nil profile.longitude
        assert_equal "failed", profile.geocode_status
        refute profile.map_ready?
        body = JSON.parse(response.body)
        assert_equal "failed", body["geocode_status"]
        assert_nil body["latitude"]
        assert_nil body["longitude"]
      end

      test "client 0,0 coordinates are rejected and not stored" do
        user = User.create!(
          email: "tech-zero-coords@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "General",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0403"
        )
        profile.update_columns(latitude: 29.7604, longitude: -95.3698, geocode_status: "success", city: "Houston", state: "Texas", country: "United States")

        with_stubbed_geocode(nil) do
          patch "/api/v1/technicians/#{profile.id}",
                params: {
                  address: "1 Conroe St",
                  city: "Conroe",
                  state: "Texas",
                  zip_code: "77301",
                  country: "United States",
                  latitude: 0,
                  longitude: 0
                },
                headers: auth_header_for(user),
                as: :json
        end

        assert_response :ok
        profile.reload
        assert_nil profile.latitude
        assert_nil profile.longitude
        assert_equal "failed", profile.geocode_status
        refute profile.map_ready?
      end

      test "technician can save multiple trade types as specialties" do
        user = User.create!(
          email: "tech-specialties-update@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          specialties: ["Electrician"],
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0388",
          city: "Austin"
        )

        patch "/api/v1/technicians/#{profile.id}",
              params: {
                trade_type: "Electrician",
                specialties: ["Electrician", "HVAC Technician", "Plumber"]
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        profile.reload
        assert_equal ["Electrician", "HVAC Technician", "Plumber"], profile.specialties

        body = JSON.parse(response.body)
        assert_equal ["Electrician", "HVAC Technician", "Plumber"], body["specialties"]
      end

      test "technician can save trade qualifications with class and years per trade" do
        user = User.create!(
          email: "tech-qualifications-update@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          skill_class: "apprentice",
          specialties: ["Electrician"],
          experience_years: 1,
          availability: "Full-time",
          phone: "713-555-0389",
          city: "Austin"
        )

        patch "/api/v1/technicians/#{profile.id}",
              params: {
                trade_qualifications: [
                  { trade_type: "Electrician", skill_class: "apprentice", experience_years: 1 },
                  { trade_type: "HVAC Technician", skill_class: "journeyman", experience_years: 5 }
                ]
              },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        profile.reload
        assert_equal "Electrician", profile.trade_type
        assert_equal "apprentice", profile.skill_class
        assert_equal 1, profile.experience_years
        assert_equal ["Electrician", "HVAC Technician"], profile.specialties
        assert_equal "HVAC Technician", profile.trade_qualifications[1]["trade_type"]
        assert_equal "journeyman", profile.trade_qualifications[1]["skill_class"]
        assert_equal 5, profile.trade_qualifications[1]["experience_years"]

        body = JSON.parse(response.body)
        assert_equal 2, body["trade_qualifications"].length
        assert_equal "HVAC Technician", body["trade_qualifications"][1]["trade_type"]
        assert_equal "journeyman", body["trade_qualifications"][1]["skill_class"]
      end

      test "technician settings stores canonical skill_class slug" do
        user = User.create!(
          email: "tech-class-update@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0390",
          city: "Austin"
        )

        patch "/api/v1/technicians/#{profile.id}",
              params: { skill_class: "Journeyman" },
              headers: auth_header_for(user),
              as: :json

        assert_response :ok
        assert_equal "journeyman", profile.reload.skill_class
        assert_equal "journeyman", JSON.parse(response.body)["skill_class"]
      end

      test "technician settings rejects arbitrary skill_class" do
        user = User.create!(
          email: "tech-class-reject@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0391",
          city: "Austin"
        )

        patch "/api/v1/technicians/#{profile.id}",
              params: { skill_class: "HVAC" },
              headers: auth_header_for(user),
              as: :json

        assert_response :unprocessable_entity
        assert_nil profile.reload.skill_class
      end

      test "technician with null skill_class can still load profile" do
        user = User.create!(
          email: "tech-class-null@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          experience_years: 2,
          availability: "Full-time",
          phone: "713-555-0392",
          city: "Austin"
        )

        get "/api/v1/technicians/profile",
            headers: auth_header_for(user),
            as: :json

        assert_response :ok
        assert_nil JSON.parse(response.body)["skill_class"]
      end

      test "company can filter technician directory by verification requirements" do
        company_user = User.create!(
          email: "company-tech-filter@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)

        verified_user = User.create!(
          email: "verified-tech-filter@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          first_name: "Verified"
        )
        verified_profile = TechnicianProfile.create!(
          user: verified_user,
          trade_type: "Electrician",
          experience_years: 8,
          availability: "Full-time",
          background_verified: true
        )
        VerificationProfile.create!(
          user: verified_user,
          identity_status: :verified,
          references_status: :verified,
          insurance_status: :verified
        )
        VerificationBadge.create!(user: verified_user, badge_type: "cert_osha_10", status: :active, earned_at: Time.current)

        unverified_user = User.create!(
          email: "unverified-tech-filter@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician,
          first_name: "Unverified"
        )
        TechnicianProfile.create!(
          user: unverified_user,
          trade_type: "Electrician",
          experience_years: 5,
          availability: "Part-time",
          background_verified: false
        )
        VerificationProfile.create!(user: unverified_user)

        get "/api/v1/technicians",
            params: {
              q: "verified",
              trade_type: "electrician",
              background_verified: true,
              identity_verified: true,
              references_verified: true,
              insurance_verified: true,
              certification: "osha 10"
            },
            headers: auth_header_for(company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes ids, verified_profile.id
        assert_equal 1, ids.size
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
