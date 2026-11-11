# frozen_string_literal: true

require "test_helper"

class FundingWaivedStatusTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "waived-status-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user,
      membership_level: "basic",
      phone: "713-555-0100",
      job_funding_waived: true
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)

    @tech_user = User.create!(
      email: "waived-status-tech-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    @tech_profile = TechnicianProfile.create!(
      user: @tech_user,
      trade_type: "General",
      availability: "Full-time",
      phone: "713-555-0199",
      membership_level: "premium",
      stripe_account_id: "acct_test_waived",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
  end

  def build_priced_job
    Job.create!(
      company_profile: @company_profile,
      title: "Waived status job",
      description: "desc",
      status: :pending_funding,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 13,
      agreed_labor_cents: 1_040_000,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 14.days.from_now,
      go_live_at: 3.days.ago
    )
  end

  def succeed_stripe!
    success = JobStripeOps::Result.new(status: "succeeded", stripe_id: "obj_#{SecureRandom.hex(4)}")
    JobStripeOps.stub(:create_payment_intent!, success) do
      JobStripeOps.stub(:transfer!, success) do
        yield
      end
    end
  end

  test "exempt publish never yields funded and sets posting exemption marker" do
    job = build_priced_job
    result = JobFundingService.fund_for_publish!(job)
    assert result[:success]
    assert result[:waived]
    job.reload
    assert job.open?
    assert job.funding_unfunded?
    assert job.posted_under_funding_waiver?
    refute job.funding_funded?
    assert_equal 0, job.job_payment_transactions.company_collections.status_succeeded.count
    refute JobLedger.for(job).fully_funded
    assert job.funding_allows_claim?
  end

  test "funded only after succeeded collections for non-waived company" do
    @company_profile.update!(job_funding_waived: false)
    job = build_priced_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    job.reload
    assert job.funding_funded?
    refute job.posted_under_funding_waiver?
    assert JobLedger.for(job).fully_funded
    assert job.job_payment_transactions.company_collections.status_succeeded.exists?
  end

  test "payout blocked for waived job with zero collections" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    job.reload
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    payment = Payment.create!(
      job: job,
      amount_cents: job.agreed_labor_cents,
      status: "pending",
      currency: "usd",
      transfer_group: job.transfer_group
    )

    transfer_called = false
    JobStripeOps.stub(:transfer!, ->(*) { transfer_called = true; raise "should not transfer" }) do
      result = PaymentService.release_to_technician(payment)
      assert result[:error].present?
      assert_match(/underfunded|Transfer blocked|no_succeeded_collections|exceeds funded/i, result[:error].to_s)
    end
    refute transfer_called
    refute job.job_payment_transactions.where(transaction_type: :technician_transfer, status: :succeeded).exists?
  end

  test "technician can claim exempt-posted unfunded job" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    job.update!(
      scheduled_start_at: 2.days.from_now,
      scheduled_end_at: 15.days.from_now
    )
    result = Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    refute result[:error], result[:error].to_s
    assert job.reload.filled? || job.job_applications.accepted.exists?
  end

  test "funding_allows_claim survives company flag revocation when marker set" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    @company_profile.update!(job_funding_waived: false)
    job.reload
    assert job.posted_under_funding_waiver?
    assert job.funding_unfunded?
    assert job.funding_allows_claim?
  end
end
