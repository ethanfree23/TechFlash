require "test_helper"

module Api
  module V1
    class TechPresenceMarkersControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "admin gets real and simulated markers" do
        admin = User.create!(email: "admin-marker@example.com", password: "password123", password_confirmation: "password123", role: :admin)
        tech_user = User.create!(email: "tech-marker@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: tech_user, trade_type: "HVAC", availability: "Full-time", membership_level: "basic", latitude: 29.7604, longitude: -95.3698)
        SimulatedTechnicianMarker.create!(name: "Sim 1", latitude: 29.7, longitude: -95.3, trade_label: "Electrical", active: true)

        get "/api/v1/tech_presence_markers", headers: auth_header_for(admin), as: :json

        assert_response :ok
        payload = JSON.parse(response.body)
        assert_operator payload.fetch("markers").length, :>=, 2
      end
    end
  end
end
