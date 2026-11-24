# frozen_string_literal: true

require "test_helper"

class Api::V1::Admin::TechnicianOnboardingsControllerTest < ActionDispatch::IntegrationTest
  include AuthTestHelper

  setup do
    @admin = User.create!(
      email: "admin-onboard-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin,
      first_name: "Admin",
      last_name: "User",
      phone: "5559998888"
    )
    @tech = User.create!(
      email: "tech-admin-onboard-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Tech",
      last_name: "User",
      phone: "5557776666",
      password_set_by: "user"
    )
    TechnicianProfile.create!(
      user: @tech,
      trade_type: "Electrician",
      skill_class: "master",
      availability: "Full-time",
      city: "Houston",
      zip_code: "77001",
      phone: "5557776666",
      membership_level: "premium",
      membership_fee_waived: true,
      background_verified: true
    )
    @headers = auth_header_for(@admin)
  end

  test "admin can read dry run report" do
    get api_v1_admin_technician_onboarding_dry_run_url, headers: @headers
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("total_technicians")
    assert body.key?("would_grandfather")
    assert body.key?("would_require")
  end

  test "admin can require onboarding again" do
    record = TechnicianOnboarding.ensure_for!(@tech)
    record.mark_completed!
    post require_onboarding_api_v1_admin_user_technician_onboarding_url(@tech),
         headers: @headers,
         as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body["ok"]
    assert_equal "in_progress", body.dig("onboarding", "status")
    assert @tech.technician_profile.reload.background_verified
    assert_equal "premium", @tech.technician_profile.membership_level
  end

  test "admin can update feature flag settings" do
    patch api_v1_admin_technician_onboarding_settings_url,
          params: { enabled: true, assessment_reminder_days: 5 },
          headers: @headers,
          as: :json
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body.dig("settings", "enabled")
    assert_equal 5, body.dig("settings", "assessment_reminder_days")
  ensure
    TechnicianGuidedOnboarding.update_settings!(enabled: false)
  end
end
