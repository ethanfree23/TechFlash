require "test_helper"

class JobSchedulePolicyTest < ActiveSupport::TestCase
  def build_job(attrs = {})
    user = User.create!(email: "company-schedule-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: user, membership_level: "premium", membership_fee_waived: true)
    user.update_column(:company_profile_id, profile.id)
    Job.new({
      company_profile: profile,
      title: "Schedule test job",
      description: "desc",
      status: :open,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 2.days.from_now
    }.merge(attrs))
  end

  test "required weekend must include at least one weekend day" do
    job = build_job(
      weekend_work_policy: :required,
      saturday_work_policy: :unavailable,
      sunday_work_policy: :unavailable
    )
    assert_not job.valid?
    assert_includes job.errors.full_messages.join(" "), "required"
  end

  test "premium day requires multiplier" do
    job = build_job(
      weekend_work_policy: :optional,
      saturday_work_policy: :premium_rate,
      saturday_multiplier: nil
    )
    assert_not job.valid?
    assert_includes job.errors.full_messages.join(" "), "Saturday multiplier"
  end

  test "prohibited weekend cannot include weekend standard days" do
    job = build_job(
      weekend_work_policy: :prohibited,
      standard_work_days: [1, 2, 3, 4, 5, 6]
    )
    assert_not job.valid?
    assert_includes job.errors.full_messages.join(" "), "Saturday"
  end
end
