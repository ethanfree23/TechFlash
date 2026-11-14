# frozen_string_literal: true

require "test_helper"

class BackgroundCheckEligibilityTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "bg-elig-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
  end

  def build_check(**attrs)
    BackgroundCheck.create!({
      user: @user,
      provider: "checkr",
      package_name: "checkrdirect_essential_criminal",
      payment_status: :waived,
      paid_by: "platform",
      status: :pending,
      normalized_status: "report_pending"
    }.merge(attrs))
  end

  test "complete alone is not eligible" do
    check = build_check(status: :processing, normalized_status: "report_complete", provider_status: "complete", result: nil)
    refute check.eligible_for_background_gate?
  end

  test "clear requires status complete and result clear" do
    check = build_check(status: :clear, normalized_status: "clear", provider_status: "complete", result: "clear")
    assert check.eligible_for_background_gate?
  end

  test "consider is never auto-eligible" do
    check = build_check(status: :consider, normalized_status: "consider", provider_status: "complete", result: "consider")
    refute check.eligible_for_background_gate?
  end

  test "suspended is never auto-eligible" do
    check = build_check(status: :suspended, normalized_status: "report_suspended", provider_status: "suspended", result: nil)
    refute check.eligible_for_background_gate?
  end

  test "disputed is never auto-eligible" do
    check = build_check(
      status: :consider,
      normalized_status: "report_disputed",
      provider_status: "complete",
      result: "clear",
      provider_assess_status: "review"
    )
    refute check.eligible_for_background_gate?
  end

  test "canceled is never auto-eligible" do
    check = build_check(status: :failed, normalized_status: "report_canceled", provider_status: "canceled")
    refute check.eligible_for_background_gate?
  end

  test "mapper requires complete+clear for automatic clear" do
    pending = CheckrLifecycleMapper.resolve(
      event_type: "report.completed",
      object: { "status" => "pending", "result" => "clear" }
    )
    assert_equal "report_pending", pending[:normalized_status]

    consider = CheckrLifecycleMapper.resolve(
      event_type: "report.completed",
      object: { "status" => "complete", "result" => "consider" }
    )
    assert_equal "consider", consider[:normalized_status]

    clear = CheckrLifecycleMapper.resolve(
      event_type: "report.completed",
      object: { "status" => "complete", "result" => "clear" }
    )
    assert_equal "clear", clear[:normalized_status]
  end
end
