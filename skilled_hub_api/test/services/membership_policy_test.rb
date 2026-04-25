require "test_helper"

class MembershipPolicyTest < ActiveSupport::TestCase
  test "returns base company pricing for premium tier" do
    owner = User.create!(email: "company-owner-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium")
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 100_000, MembershipPolicy.company_monthly_fee_cents(profile)
    assert_equal 0, MembershipPolicy.company_commission_percent(profile)
  end

  test "fee waiver makes effective fee and commission zero" do
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
    assert_equal 0.0, MembershipPolicy.technician_commission_percent(profile)
  end

  test "respects go_live access windows by tier" do
    MembershipTierConfig.delete_all
    MembershipTierConfig.create!(audience: "technician", slug: "basic", display_name: "Basic", monthly_fee_cents: 0, commission_percent: 20, early_access_delay_hours: 0, job_access_min_experience_years: 0, sort_order: 0)
    MembershipTierConfig.create!(audience: "technician", slug: "pro", display_name: "Pro", monthly_fee_cents: 4900, commission_percent: 20, early_access_delay_hours: 12, job_access_min_experience_years: 0, sort_order: 1)
    MembershipTierConfig.create!(audience: "technician", slug: "premium", display_name: "Premium", monthly_fee_cents: 24900, commission_percent: 10, early_access_delay_hours: 24, job_access_min_experience_years: 0, sort_order: 2)
    MembershipPolicy.invalidate_cache!

    company_owner = User.create!(email: "company-posted-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(company_profile: company_profile, title: "Posted Window Job", description: "desc", status: :open)
    job.update_column(:go_live_at, 8.hours.from_now)

    pro_user = User.create!(email: "pro-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    pro_profile = TechnicianProfile.create!(user: pro_user, trade_type: "General", availability: "Full-time", membership_level: "pro")
    basic_user = User.create!(email: "basic-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    basic_profile = TechnicianProfile.create!(user: basic_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

    premium_user = User.create!(email: "premium-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    premium_profile = TechnicianProfile.create!(user: premium_user, trade_type: "General", availability: "Full-time", membership_level: "premium")

    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: basic_profile)
    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: pro_profile)
    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: premium_profile)
  end

  test "enforces minimum years from job and tier access policy" do
    MembershipTierConfig.delete_all
    MembershipTierConfig.create!(audience: "technician", slug: "basic", display_name: "Basic", monthly_fee_cents: 0, commission_percent: 20, early_access_delay_hours: 0, job_access_min_experience_years: 6, sort_order: 0)
    MembershipPolicy.invalidate_cache!

    company_owner = User.create!(email: "company-experience-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(
      company_profile: company_profile,
      title: "Experience Gate Job",
      description: "desc",
      status: :open,
      minimum_years_experience: 4
    )

    junior_user = User.create!(email: "junior-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    junior_profile = TechnicianProfile.create!(user: junior_user, trade_type: "General", availability: "Full-time", membership_level: "basic", experience_years: 5)
    senior_user = User.create!(email: "senior-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    senior_profile = TechnicianProfile.create!(user: senior_user, trade_type: "General", availability: "Full-time", membership_level: "basic", experience_years: 7)

    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: junior_profile)
    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: senior_profile)
  end
end
