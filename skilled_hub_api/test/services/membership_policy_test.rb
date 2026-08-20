require "test_helper"

class MembershipPolicyTest < ActiveSupport::TestCase
  test "returns base company pricing for premium tier" do
    owner = User.create!(email: "company-owner-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium")
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 100_000, MembershipPolicy.company_monthly_fee_cents(profile)
    assert_equal 10.0, MembershipPolicy.company_commission_percent(profile)
  end

  test "zero company commission override uses the chart rate" do
    owner = User.create!(email: "company-zero-override@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium", commission_override_percent: 0)
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 10.0, MembershipPolicy.company_commission_percent(profile)
  end

  test "company premium commission follows the Admin chart not a hardcoded 10 percent" do
    tier = MembershipTierConfig.find_by!(audience: "company", slug: "premium")
    tier.update!(commission_percent: 8.0)
    MembershipPolicy.invalidate_cache!

    owner = User.create!(email: "company-chart-source@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium", commission_override_percent: nil)
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 8.0, MembershipPolicy.company_commission_percent(profile)
  ensure
    MembershipTierConfig.where(audience: "company", slug: "premium").update_all(commission_percent: 10.0)
    MembershipPolicy.invalidate_cache!
  end

  test "positive company commission override wins over the chart rate" do
    owner = User.create!(email: "company-custom-override@example.com", password: "password123", password_confirmation: "password123", role: :company)
    profile = CompanyProfile.create!(user: owner, membership_level: "premium", commission_override_percent: 7.5)
    owner.update_column(:company_profile_id, profile.id)

    assert_equal 7.5, MembershipPolicy.company_commission_percent(profile)
  end

  test "fee waiver makes monthly fee zero but keeps tier commission" do
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

  test "fee waiver without override keeps configured tier commission" do
    user = User.create!(email: "tech-policy-tier@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    profile = TechnicianProfile.create!(
      user: user,
      trade_type: "HVAC",
      availability: "Full-time",
      membership_level: "premium",
      membership_fee_waived: true,
      commission_override_percent: nil
    )

    assert_equal 0, MembershipPolicy.technician_monthly_fee_cents(profile)
    assert_equal 10.0, MembershipPolicy.technician_commission_percent(profile)
  end

  test "respects access after go_live windows by tier" do
    MembershipTierConfig.where(audience: "technician").delete_all
    # Premium-first release: shortest delay first, longest for basic (anchor = job go_live_at).
    MembershipTierConfig.create!(audience: "technician", slug: "premium", display_name: "Premium", monthly_fee_cents: 24900, commission_percent: 10, early_access_delay_hours: 0, job_access_min_experience_years: 0, sort_order: 0)
    MembershipTierConfig.create!(audience: "technician", slug: "pro", display_name: "Pro", monthly_fee_cents: 4900, commission_percent: 20, early_access_delay_hours: 12, job_access_min_experience_years: 0, sort_order: 1)
    MembershipTierConfig.create!(audience: "technician", slug: "basic", display_name: "Basic", monthly_fee_cents: 0, commission_percent: 20, early_access_delay_hours: 24, job_access_min_experience_years: 0, sort_order: 2)
    MembershipPolicy.invalidate_cache!

    company_owner = User.create!(email: "company-posted-policy@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(company_profile: company_profile, title: "Posted Window Job", description: "desc", status: :open)
    # Premium 0h / Pro 12h / Basic 24h after go_live — anchor so pro window has opened (≥12h) but basic has not (<24h).
    job.update_column(:go_live_at, 14.hours.ago)

    pro_user = User.create!(email: "pro-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    pro_profile = TechnicianProfile.create!(user: pro_user, trade_type: "General", availability: "Full-time", membership_level: "pro")
    basic_user = User.create!(email: "basic-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    basic_profile = TechnicianProfile.create!(user: basic_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

    premium_user = User.create!(email: "premium-tech-policy@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    premium_profile = TechnicianProfile.create!(user: premium_user, trade_type: "General", availability: "Full-time", membership_level: "premium")

    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: premium_profile)
    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: pro_profile)
    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: basic_profile)
  end

  test "enforces minimum years from job and tier access policy" do
    MembershipTierConfig.where(audience: "technician").delete_all
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

  test "enforces additional feature gates for completed jobs and profile completeness" do
    MembershipTierConfig.where(audience: "technician").delete_all
    MembershipTierConfig.create!(
      audience: "technician",
      slug: "basic",
      display_name: "Basic",
      monthly_fee_cents: 0,
      commission_percent: 20,
      early_access_delay_hours: 0,
      job_access_min_experience_years: 0,
      job_access_min_jobs_completed: 1,
      job_access_min_successful_jobs: 1,
      job_access_min_profile_completeness_percent: 60,
      job_access_requires_verified_background: false,
      sort_order: 0
    )
    MembershipPolicy.invalidate_cache!

    company_owner = User.create!(email: "company-feature-gates@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    visible_job = Job.create!(company_profile: company_profile, title: "Visible Gate Job", description: "desc", status: :open)
    visible_job.update_column(:go_live_at, 2.hours.ago)

    prior_completed_job = Job.create!(company_profile: company_profile, title: "Prior Completed Job", description: "desc", status: :finished)
    prior_completed_job.update_column(:go_live_at, 3.days.ago)

    qualified_user = User.create!(email: "qualified-feature-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    qualified_profile = TechnicianProfile.create!(
      user: qualified_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic",
      bio: "Strong profile bio",
      phone: "555-555-1234",
      city: "Austin"
    )
    JobApplication.create!(job: prior_completed_job, technician_profile: qualified_profile, status: :accepted)

    unqualified_user = User.create!(email: "unqualified-feature-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    unqualified_profile = TechnicianProfile.create!(
      user: unqualified_user,
      trade_type: "General",
      availability: nil,
      membership_level: "basic",
      bio: nil,
      phone: nil,
      city: nil
    )

    assert MembershipPolicy.job_visible_to_technician?(job: visible_job, technician_profile: qualified_profile)
    assert_not MembershipPolicy.job_visible_to_technician?(job: visible_job, technician_profile: unqualified_profile)
  end

  test "profile completeness counts city or legacy location as service area" do
    with_city = TechnicianProfile.new(
      trade_type: "G",
      availability: "A",
      bio: "B",
      phone: "P",
      city: "Austin"
    )
    with_location = TechnicianProfile.new(
      trade_type: "G",
      availability: "A",
      bio: "B",
      phone: "P",
      location: "Dallas, TX",
      city: nil
    )
    missing_area = TechnicianProfile.new(
      trade_type: "G",
      availability: "A",
      bio: "B",
      phone: "P",
      city: nil,
      location: nil
    )

    assert_equal 100, MembershipPolicy.technician_profile_completeness_percent(with_city)
    assert_equal 100, MembershipPolicy.technician_profile_completeness_percent(with_location)
    assert_equal 80, MembershipPolicy.technician_profile_completeness_percent(missing_area)
  end

  test "enforces verified background additional feature gate" do
    MembershipTierConfig.where(audience: "technician").delete_all
    MembershipTierConfig.create!(
      audience: "technician",
      slug: "basic",
      display_name: "Basic",
      monthly_fee_cents: 0,
      commission_percent: 20,
      early_access_delay_hours: 0,
      job_access_min_experience_years: 0,
      job_access_min_jobs_completed: 0,
      job_access_min_successful_jobs: 0,
      job_access_min_profile_completeness_percent: 0,
      job_access_requires_verified_background: true,
      sort_order: 0
    )
    MembershipPolicy.invalidate_cache!

    company_owner = User.create!(email: "company-background-gate@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    visible_job = Job.create!(company_profile: company_profile, title: "Background Gate Job", description: "desc", status: :open)
    visible_job.update_column(:go_live_at, 2.hours.ago)

    verified_user = User.create!(email: "verified-background-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    verified_profile = TechnicianProfile.create!(
      user: verified_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic",
      background_verified: true
    )

    unverified_user = User.create!(email: "unverified-background-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    unverified_profile = TechnicianProfile.create!(
      user: unverified_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic",
      background_verified: false
    )

    assert MembershipPolicy.job_visible_to_technician?(job: visible_job, technician_profile: verified_profile)
    assert_not MembershipPolicy.job_visible_to_technician?(job: visible_job, technician_profile: unverified_profile)
  end

  test "uses membership_tier_configs as source of truth for technician and company pricing" do
    tech_tier = MembershipTierConfig.find_by!(audience: "technician", slug: "premium")
    company_tier = MembershipTierConfig.find_by!(audience: "company", slug: "pro")
    tech_tier.update!(commission_percent: 5.0, monthly_fee_cents: 19_900)
    company_tier.update!(commission_percent: 7.0, monthly_fee_cents: 33_300)
    MembershipPolicy.invalidate_cache!

    tech_user = User.create!(email: "source-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tech_profile = TechnicianProfile.create!(user: tech_user, trade_type: "HVAC", availability: "Full-time", membership_level: "premium")
    company_user = User.create!(email: "source-company@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_user, membership_level: "pro")
    company_user.update_column(:company_profile_id, company_profile.id)

    assert_equal 19_900, MembershipPolicy.technician_monthly_fee_cents(tech_profile)
    assert_equal 5.0, MembershipPolicy.technician_commission_percent(tech_profile)
    assert_equal 33_300, MembershipPolicy.company_monthly_fee_cents(company_profile)
    assert_equal 7.0, MembershipPolicy.company_commission_percent(company_profile)
  end

  test "raises when technician tier config rows are missing" do
    MembershipTierConfig.where(audience: "technician").delete_all
    MembershipPolicy.invalidate_cache!

    profile = TechnicianProfile.new(membership_level: "premium")

    error = assert_raises(MembershipPolicy::MissingTierConfigError) do
      MembershipPolicy.technician_commission_percent(profile)
    end
    assert_match(/no membership tier configs found/, error.message)
  end

  test "trade matching allows matching technician specialties" do
    company_owner = User.create!(email: "company-trade-match@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(
      company_profile: company_profile,
      title: "Plumbing trade job",
      description: "desc",
      status: :open,
      trade_type: "Plumber",
      go_live_at: 3.days.ago
    )

    tech_user = User.create!(email: "tech-trade-specialty@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tech_profile = TechnicianProfile.create!(
      user: tech_user,
      trade_type: "Electrician",
      specialties: ["Plumber"],
      availability: "Full-time",
      membership_level: "basic"
    )

    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: tech_profile)
  end

  test "trade matching blocks non-matching technician when job trade is set" do
    company_owner = User.create!(email: "company-trade-mismatch@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(
      company_profile: company_profile,
      title: "Electrical trade job",
      description: "desc",
      status: :open,
      trade_type: "Electrician",
      go_live_at: 3.days.ago
    )

    tech_user = User.create!(email: "tech-trade-mismatch@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tech_profile = TechnicianProfile.create!(
      user: tech_user,
      trade_type: "Plumber",
      specialties: ["HVAC Technician"],
      availability: "Full-time",
      membership_level: "basic"
    )

    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: tech_profile)
  end

  test "skill_class is not used as a trade fallback" do
    company_owner = User.create!(email: "company-class-not-trade@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_owner, membership_level: "basic")
    company_owner.update_column(:company_profile_id, company_profile.id)

    job = Job.create!(
      company_profile: company_profile,
      title: "Electrical job with legacy class",
      description: "desc",
      status: :open,
      trade_type: "Electrician",
      skill_class: "HVAC",
      go_live_at: 3.days.ago
    )

    hvac_user = User.create!(email: "hvac-class-fallback@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    hvac_profile = TechnicianProfile.create!(
      user: hvac_user,
      trade_type: "HVAC Technician",
      availability: "Full-time",
      membership_level: "basic"
    )
    electrician_user = User.create!(email: "elec-class-fallback@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    electrician_profile = TechnicianProfile.create!(
      user: electrician_user,
      trade_type: "Electrician",
      availability: "Full-time",
      membership_level: "basic"
    )

    assert_not MembershipPolicy.technician_trade_match?(job: job, technician_profile: hvac_profile)
    assert MembershipPolicy.technician_trade_match?(job: job, technician_profile: electrician_profile)
    assert_not MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: hvac_profile)
    assert MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: electrician_profile)
  end
end
