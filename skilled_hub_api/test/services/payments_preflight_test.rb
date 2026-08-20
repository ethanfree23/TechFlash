require "test_helper"

class PaymentsPreflightTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "preflight-co@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_preflight"
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user,
      membership_level: "premium",
      membership_fee_waived: true,
      phone: "713-555-0190"
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)

    @tech_user = User.create!(
      email: "preflight-tech@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    @tech_profile = TechnicianProfile.create!(
      user: @tech_user,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "premium",
      phone: "713-555-0192",
      stripe_account_id: "acct_preflight",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
  end

  test "membership fee waived is not a job-funding blocker" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "Preflight job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10.0
    )

    report = PaymentsPreflight.new(job_id: job.id).run
    text = report.to_s
    assert_includes text, "membership_fee_waived: true (monthly subscription only; does not skip job charges)"
    blockers = report.instance_variable_get(:@blockers)
    refute blockers.any? { |b| b.include?("membership_fee_waived") }
  end

  test "job_funding_waived is called out as skipping charge" do
    @company_profile.update!(job_funding_waived: true)
    job = Job.create!(
      company_profile: @company_profile,
      title: "Waived funding job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10.0
    )

    report = PaymentsPreflight.new(job_id: job.id).run
    text = report.to_s
    assert_match(/job_funding_waived is true — this company would skip the job PaymentIntent/i, text)
    refute report.ready?
  end

  test "proposed labor quotes charge from live company commission without creating a job" do
    jobs_before = Job.count
    payments_before = Payment.count
    txns_before = JobPaymentTransaction.count

    report = PaymentsPreflight.new(
      company_email: @company_user.email,
      technician_email: @tech_user.email,
      labor_cents: 1000
    ).run
    text = report.to_s

    assert_equal jobs_before, Job.count
    assert_equal payments_before, Payment.count
    assert_equal txns_before, JobPaymentTransaction.count

    assert_includes text, "PROPOSED JOB"
    assert_includes text, "labor = $10.00"
    assert_includes text, "company commission = 10.0%"
    assert_includes text, "company fee = $1.00"
    assert_includes text, "expected Stripe charge = $11.00"
    assert_includes text, "proposed gross = $10.00"
    assert_includes text, "technician fee = $1.00"
    assert_includes text, "expected net transfer = $9.00"
    assert_includes text, "membership_fee_waived: true"
    assert report.ready?, text
    assert_includes text, "READY FOR LIVE PAYMENT: YES"
  end

  test "proposed mode requires LABOR_CENTS when there is no JOB_ID" do
    report = PaymentsPreflight.new(company_email: @company_user.email).run
    refute report.ready?
    assert_match(/LABOR_CENTS is required/i, report.to_s)
  end

  test "proposed mode uses commission override not a later invented 0 percent" do
    @company_profile.update!(commission_override_percent: 7.5)
    report = PaymentsPreflight.new(
      company_email: @company_user.email,
      labor_cents: 1000
    ).run
    text = report.to_s
    assert_includes text, "commission override: 7.5"
    assert_includes text, "effective company commission %: 7.5"
    assert_includes text, "company fee = $0.75"
    assert_includes text, "expected Stripe charge = $10.75"
  end

  test "JOB_ID mode still audits an existing job" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "Existing job",
      description: "desc",
      status: :open,
      hourly_rate_cents: 1000,
      hours_per_day: 1,
      days: 1,
      company_commission_percent_snapshot: 10.0
    )

    report = PaymentsPreflight.new(job_id: job.id, labor_cents: 9999).run
    text = report.to_s
    assert_includes text, "JOB"
    assert_includes text, "labor = $10.00"
    assert_includes text, "expected Stripe charge = $11.00"
    assert_match(/LABOR_CENTS ignored/i, text)
  end
end
