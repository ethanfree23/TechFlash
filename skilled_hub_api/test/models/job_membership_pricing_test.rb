require "test_helper"

class JobMembershipPricingTest < ActiveSupport::TestCase
  test "uses membership commission rates for company charge and technician payout" do
    company_user = User.create!(email: "job-company@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_user, membership_level: "pro")
    company_user.update_column(:company_profile_id, company_profile.id)

    tech_user = User.create!(email: "job-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tech_profile = TechnicianProfile.create!(user: tech_user, trade_type: "General", availability: "Full-time", membership_level: "premium")

    job = Job.create!(
      company_profile: company_profile,
      title: "Membership pricing job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 10_000,
      hours_per_day: 1,
      days: 1
    )

    JobApplication.create!(job: job, technician_profile: tech_profile, status: :accepted)

    # Company Pro = +5%, Technician Premium = -10%
    assert_equal 10_500, job.company_charge_cents
    assert_equal 9_000, job.tech_payout_cents
  end

  test "respects override commissions on both sides" do
    company_user = User.create!(email: "job-company-override@example.com", password: "password123", password_confirmation: "password123", role: :company)
    company_profile = CompanyProfile.create!(user: company_user, membership_level: "premium", commission_override_percent: 2.5)
    company_user.update_column(:company_profile_id, company_profile.id)

    tech_user = User.create!(email: "job-tech-override@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tech_profile = TechnicianProfile.create!(user: tech_user, trade_type: "General", availability: "Full-time", membership_level: "pro", commission_override_percent: 4.0)

    job = Job.create!(
      company_profile: company_profile,
      title: "Membership pricing override job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 20_000,
      hours_per_day: 1,
      days: 1
    )
    JobApplication.create!(job: job, technician_profile: tech_profile, status: :accepted)

    assert_equal 20_500, job.company_charge_cents
    assert_equal 19_200, job.tech_payout_cents
  end
end
