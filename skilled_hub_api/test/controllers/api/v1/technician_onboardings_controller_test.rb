# frozen_string_literal: true

require "test_helper"

class Api::V1::TechnicianOnboardingsControllerTest < ActionDispatch::IntegrationTest
  include AuthTestHelper

  setup do
    TechnicianGuidedOnboarding.update_settings!(enabled: true)
    @tech = User.create!(
      email: "onboard-ctrl-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Pat",
      last_name: "Controller",
      phone: "5553334444",
      password_set_by: "user"
    )
    TechnicianProfile.create!(
      user: @tech,
      trade_type: "Plumber",
      skill_class: "apprentice",
      availability: "Full-time",
      city: "Dallas",
      zip_code: "75201",
      phone: "5553334444",
      membership_level: "basic"
    )
    @headers = auth_header_for(@tech)
  end

  teardown do
    TechnicianGuidedOnboarding.update_settings!(enabled: false)
  end

  test "show returns onboarding payload for technician" do
    get api_v1_technician_onboarding_url, headers: @headers
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body["feature_enabled"]
    assert_equal true, body["required"]
    assert body["sections"].key?("profile")
  end

  test "company cannot access technician onboarding" do
    company = User.create!(
      email: "co-ctrl-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Co",
      last_name: "User"
    )
    get api_v1_technician_onboarding_url, headers: auth_header_for(company)
    assert_response :forbidden
  end

  test "update persists progress" do
    patch api_v1_technician_onboarding_url,
          params: { current_section: "profile", current_substep: "personal", completed_section: "notifications" },
          headers: @headers,
          as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_includes body["completed_sections"], "notifications"
    assert_equal "profile", body["current_section"]
  end

  test "complete rejects incomplete onboarding" do
    post complete_api_v1_technician_onboarding_url, headers: @headers, as: :json
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal false, body["ok"]
  end

  test "user serializer includes guided_onboarding" do
    post api_v1_sessions_url, params: { email: @tech.email, password: "password123" }, as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert body.dig("user", "guided_onboarding").is_a?(Hash)
    assert_equal true, body.dig("user", "guided_onboarding", "required")
  end

  test "disabling flag stops requiring onboarding" do
    TechnicianGuidedOnboarding.update_settings!(enabled: false)
    get api_v1_technician_onboarding_url, headers: @headers
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal false, body["required"]
    assert_equal false, body["feature_enabled"]
  end
end
