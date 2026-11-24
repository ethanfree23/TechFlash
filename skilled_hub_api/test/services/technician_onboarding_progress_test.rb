# frozen_string_literal: true

require "test_helper"

class TechnicianOnboardingProgressTest < ActiveSupport::TestCase
  setup do
    TechnicianGuidedOnboarding.update_settings!(enabled: true)
    @user = User.create!(
      email: "tech-onboard-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      first_name: "Alex",
      last_name: "Tech",
      phone: "5551112222",
      password_set_by: "user"
    )
    @profile = TechnicianProfile.create!(
      user: @user,
      trade_type: "HVAC Technician",
      skill_class: "journeyman",
      experience_years: 5,
      availability: "Full-time",
      city: "Austin",
      state: "TX",
      zip_code: "78701",
      phone: "5551112222",
      membership_level: "basic"
    )
  end

  teardown do
    TechnicianGuidedOnboarding.update_settings!(enabled: false)
  end

  test "feature flag off means onboarding not required" do
    TechnicianGuidedOnboarding.update_settings!(enabled: false)
    progress = TechnicianOnboardingProgress.for(@user)
    assert_equal false, progress[:required]
    assert_equal false, progress[:feature_enabled]
  end

  test "incomplete technician is required when flag enabled" do
    progress = TechnicianOnboardingProgress.for(@user)
    assert progress[:feature_enabled]
    assert progress[:required]
    assert_equal "not_started", progress[:status]
  end

  test "company and admin are never required" do
    company = User.create!(
      email: "co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      first_name: "Co",
      last_name: "Mpany"
    )
    assert_equal false, TechnicianOnboardingProgress.for(company)[:required]
  end

  test "notifications and membership require section review marks" do
    progress = TechnicianOnboardingProgress.for(@user)
    refute progress.dig(:sections, :notifications, :technician_complete)
    refute progress.dig(:sections, :membership, :technician_complete)

    record = TechnicianOnboarding.ensure_for!(@user)
    record.mark_progress!(section: "notifications", completed_section: "notifications")
    record.mark_progress!(section: "membership", completed_section: "membership")
    record.mark_progress!(section: "billing", completed_section: "billing")

    3.times do |i|
      VerificationReference.create!(
        technician_user: @user,
        full_name: "Ref #{i}",
        email: "ref#{i}-#{SecureRandom.hex(3)}@example.com",
        relationship: "Supervisor",
        status: :requested
      )
    end

    progress = TechnicianOnboardingProgress.for(@user.reload)
    assert progress.dig(:sections, :profile, :technician_complete)
    assert progress.dig(:sections, :notifications, :technician_complete)
    assert progress.dig(:sections, :membership, :technician_complete)
    assert progress.dig(:sections, :billing, :technician_complete)
  end

  test "completion is idempotent and unlocks access" do
    record = TechnicianOnboarding.ensure_for!(@user)
    %w[profile verification notifications billing membership].each do |section|
      record.mark_progress!(section: section, completed_section: section)
    end
    3.times do |i|
      VerificationReference.create!(
        technician_user: @user,
        full_name: "Ref #{i}",
        email: "refb#{i}-#{SecureRandom.hex(3)}@example.com",
        relationship: "Supervisor",
        status: :requested
      )
    end
    @profile.update!(background_verified: true)

    first = TechnicianOnboardingCompleter.call(user: @user)
    assert first.ok, first.error.to_s
    assert_equal false, first.already_complete

    second = TechnicianOnboardingCompleter.call(user: @user)
    assert second.ok
    assert second.already_complete

    progress = TechnicianOnboardingProgress.for(@user.reload)
    assert_equal false, progress[:required]
    assert_equal "completed", progress[:status]
  end

  test "admin require onboarding does not wipe profile data" do
    record = TechnicianOnboarding.ensure_for!(@user)
    record.mark_completed!
    admin = User.create!(
      email: "admin-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin,
      first_name: "Ada",
      last_name: "Min",
      phone: "5550001111"
    )
    record.require_again!(admin: admin)
    @user.reload
    assert_equal "Alex", @user.first_name
    assert_equal "HVAC Technician", @user.technician_profile.trade_type
    assert_equal "in_progress", record.reload.status
    assert record.required_by_admin_at.present?
    assert TechnicianOnboardingProgress.for(@user)[:required]
  end

  test "grandfathering dry run returns counts" do
    result = TechnicianOnboardingGrandfathering.dry_run(limit_samples: 5)
    assert result.total_technicians >= 1
    assert result.would_require + result.would_grandfather >= 1
  end
end
