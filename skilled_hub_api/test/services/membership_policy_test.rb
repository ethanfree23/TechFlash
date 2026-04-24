require "test_helper"

class MembershipPolicyTest < ActiveSupport::TestCase
  test "returns base company pricing for premium tier" do
    owner = User.create!(email: "company-owner-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium")
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 100_000, MembershipPolicy.company_monthly_fee_cents(profile)
    assert_equal 0, MembershipPolicy.company_commission_percent(profile)
  end

  test "applies fee waiver and commission override" do
    user = User.create!(email: "tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    profile = TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "premium",
      membership_fee_waived: true,
      commission_override_percent: 7.5
    )

    assert_equal 0, MembershipPolicy.technician_monthly_fee_cents(profile)
    assert_equal 7.5, MembershipPolicy.technician_commission_percent(profile)
  end

  test "respects posted_at access windows by tier" do
    company_owner = User.create!(email: "company-posted-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(company_profile: company_profile, title: "Posted Window Job", description: "desc", status: :open)
    job.update_column(:created_at, 30.hours.ago)

    pro_user = User.create!(email: "pro-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    pro_profile = TechnicianProfile.create!(user: pro_user, trade_type: "General", availability: "Full-time", membership_level: "pro")

    basic_user = User.create!(email: "basic-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    basic_profile = TechnicianProfile.create!(user: basic_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: pro_profile)
    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: basic_profile)
  end
end
