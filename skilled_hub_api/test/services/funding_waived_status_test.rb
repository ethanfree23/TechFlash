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

  def build_priced_job(company: @company_profile)
    Job.create!(
      company_profile: company,
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

  def processing_ach_result(pi_id: "pi_ach_#{SecureRandom.hex(4)}")
    JobStripeOps::Result.new(
      status: "processing",
      stripe_id: pi_id,
      payment_method_id: "pm_bank_1",
      payment_method_type: "us_bank_account",
      payment_method_last4: "6789",
      payment_method_bank_name: "Chase"
    )
  end

  # --- HSI-style waived posting -------------------------------------------------

  test "HSI waived publish never yields funded and sets posting exemption marker" do
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
    ledger = JobLedger.for(job)
    refute ledger.fully_funded
    assert_equal 0, ledger.net_funded_cents
    assert job.funding_allows_claim?
  end

  # --- Card funding -------------------------------------------------------------

  test "card funding stamps funded only after succeeded collections" do
    @company_profile.update!(job_funding_waived: false)
    job = build_priced_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    job.reload
    assert job.funding_funded?
    refute job.posted_under_funding_waiver?
    ledger = JobLedger.for(job)
    assert ledger.fully_funded
    assert ledger.net_funded_cents.positive?
    assert job.job_payment_transactions.company_collections.status_succeeded.exists?
  end

  # --- ACH processing -----------------------------------------------------------

  test "ACH processing leaves job unpublished and not funded" do
    @company_profile.update!(job_funding_waived: false)
    job = build_priced_job
    result = nil
    JobStripeOps.stub(:create_payment_intent!, processing_ach_result) do
      result = JobFundingService.fund_for_publish!(job)
    end
    assert result[:processing]
    refute result[:success]
    job.reload
    assert job.pending_funding?
    assert job.funding_adjustment_required?
    refute job.funding_funded?
    ledger = JobLedger.for(job)
    assert_equal 0, ledger.collected_cents
    assert_equal 0, ledger.net_funded_cents
    refute ledger.fully_funded
  end

  # --- Ledger payout gates ------------------------------------------------------

  test "payout blocked: underfunded, net_funded zero, no_succeeded_collections" do
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

    ledger = JobLedger.for(job)
    refute ledger.fully_funded
    assert_equal 0, ledger.net_funded_cents
    allocation = PaymentService.source_transaction_decision(job, amount_cents: 1)
    assert_equal "blocked", allocation[:mode]
    assert_equal "no_succeeded_collections", allocation[:reason]

    transfer_called = false
    JobStripeOps.stub(:transfer!, ->(*) { transfer_called = true; raise "should not transfer" }) do
      result = PaymentService.release_to_technician(payment)
      assert result[:error].present?
      assert_match(/underfunded|Transfer blocked|no_succeeded_collections|exceeds funded/i, result[:error].to_s)
    end
    refute transfer_called
    refute job.job_payment_transactions.where(transaction_type: :technician_transfer, status: :succeeded).exists?
  end

  test "settlement blocked for waived job with zero collections" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    job.update!(status: :finished, finished_at: 4.days.ago)

    failed = JobStripeOps::Result.new(status: "failed", error: "no payment method")
    JobStripeOps.stub(:create_payment_intent!, failed) do
      settle = JobSettlementService.settle!(job.reload)
      refute settle[:success]
    end
    job.reload
    refute job.settlement_settled?
    refute job.funding_funded?
  end

  # --- Claim + work-start -------------------------------------------------------

  test "technician can claim exempt-posted unfunded job" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    job.update!(
      scheduled_start_at: 2.days.from_now,
      scheduled_end_at: 15.days.from_now
    )
    # Stub schedule detector: PG DISTINCT on jobs.json columns is a known pre-existing
    # ConflictDetector issue unrelated to funding_status semantics.
    no_conflict = Schedule::ConflictDetector::Result.new(
      conflict: false,
      indeterminate: false,
      conflicting_job_ids: [],
      conflicting_dates: [],
      available_dates: [],
      requested_dates: [],
      committed_through_at: nil,
      commitments: []
    )
    result = nil
    Schedule::ConflictDetector.stub(:call, no_conflict) do
      result = Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    end
    refute result[:error], result[:error].to_s
    assert job.reload.filled? || job.job_applications.accepted.exists?
  end

  test "work-start time entry does not require funding_funded" do
    job = build_priced_job
    JobFundingService.fund_for_publish!(job)
    job.reload
    assert job.funding_unfunded?
    assert job.posted_under_funding_waiver?
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    job.update!(status: :filled, scheduled_start_at: 1.day.ago, scheduled_end_at: 5.days.from_now)

    # Controllers/services do not gate time entries on funding_status.
    # Prove work can be recorded while financially unfunded under the exemption marker.
    entry = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 1.day.ago.change(hour: 8),
      worked_end_at: 1.day.ago.change(hour: 16),
      worked_on_date: 1.day.ago.to_date,
      worked_hours: 8,
      job_timezone: "UTC",
      status: :submitted
    )
    assert entry.persisted?
    assert job.reload.funding_unfunded?
    refute job.funding_funded?
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
