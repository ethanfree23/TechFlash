# frozen_string_literal: true

require "test_helper"

module TrustSafety
  class TechnicianFacingProfileTest < ActiveSupport::TestCase
    setup do
      @user = User.create!(
        email: "tech-facing-profile@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :technician,
        first_name: "Trevion",
        last_name: "Thompson",
        phone: "3463458013"
      )
      @profile = TechnicianProfile.create!(user: @user, trade_type: "electrician")
      @user.reload
    end

    test "returns nil for non-technician users" do
      company = User.create!(
        email: "company-facing-profile@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      assert_nil TechnicianFacingProfile.call(company)
    end

    test "includes checklist summary badges and strips admin-only background fields" do
      BackgroundCheck.create!(
        user: @user,
        provider: "checkr",
        package_name: "essential",
        status: :clear,
        normalized_status: "clear",
        provider_status: "complete",
        result: "clear",
        payment_status: :waived,
        paid_by: "platform",
        completed_at: Time.current,
        report_url: "https://dashboard.checkr.com/reports/secret",
        dashboard_url: "https://dashboard.checkr.com/reports/secret",
        admin_notes: "internal override note"
      )
      @profile.update!(background_verified: true)

      payload = TechnicianFacingProfile.call(@user.reload)
      assert payload
      assert_equal true, payload.dig(:summary, :background_verified)
      assert payload[:checklist].any? { |row| row[:key] == "background_check" && row[:status] == "verified" }

      contact = payload[:checklist].find { |row| row[:key] == "contact" }
      assert_equal "Profile & contact", contact[:label]
      assert_includes contact[:detail], "Photo missing"
      assert_includes contact[:detail], "Email on file"
      assert_includes contact[:detail], "Phone on file"

      check = payload.dig(:items, :background_checks).first
      refute check.key?(:checkr_summary)
      refute check.key?(:reviewer_decision)
      refute check.key?(:actions)
      assert check.dig(:eligibility, :eligible_for_verified_badge) || check.dig(:eligibility, "eligible_for_verified_badge")
    end

    test "rewrites technician next actions for incomplete background check" do
      payload = TechnicianFacingProfile.call(@user)
      bg = payload[:checklist].find { |row| row[:key] == "background_check" }
      assert_equal "not_started", bg[:status]
      assert_equal "Start your background check below.", bg[:next_action]
    end
  end
end
