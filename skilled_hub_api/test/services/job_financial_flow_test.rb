require "test_helper"

class JobMoneyTest < ActiveSupport::TestCase
  test "percent_of uses integer cents and admin percentages" do
    assert_equal 60_000, JobMoney.percent_of(600_000, 10)
    assert_equal 30_000, JobMoney.percent_of(600_000, 5)
    assert_equal 630_000, JobMoney.company_charge_cents(600_000, 5)
    assert_equal 540_000, JobMoney.technician_payout_cents(600_000, 10)
  end
end

class JobFinancialFlowTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(email: "flow-co-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
    @company_user.update_column(:company_profile_id, @company_profile.id)
    @tech_user = User.create!(email: "flow-tech-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    @tech_profile = TechnicianProfile.create!(
      user: @tech_user,
      trade_type: "General",
      availability: "Full-time",
      phone: "713-555-0199",
      membership_level: "basic",
      stripe_account_id: "acct_test",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
  end

  def succeed_stripe!
    success = JobStripeOps::Result.new(status: "succeeded", stripe_id: "obj_#{SecureRandom.hex(4)}")
    JobStripeOps.stub(:create_payment_intent!, success) do
      JobStripeOps.stub(:refund!, success) do
        JobStripeOps.stub(:transfer!, success) do
          yield
        end
      end
    end
  end

  def build_job(pay_basis: :actual_hours_worked, rate: 7_500, hours: 8, days: 10)
    Job.create!(
      company_profile: @company_profile,
      title: "Ledger job",
      description: "desc",
      status: :pending_funding,
      pay_basis: pay_basis,
      hourly_rate_cents: rate,
      hours_per_day: hours,
      days: days,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 12.days.from_now,
      go_live_at: 3.days.ago
    )
  end

  test "admin commission change does not alter funded snapshot" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    original = job.reload.company_commission_percent_snapshot
    tier = MembershipTierConfig.find_by(audience: "company", slug: "basic")
    tier.update!(commission_percent: 50)
    MembershipPolicy.invalidate_cache!
    job.reload
    assert_equal original, job.company_commission_percent_snapshot
    assert_equal JobMoney.company_charge_cents(job.agreed_labor_cents, original), job.company_charge_cents
  end

  test "pay to post funds then publishes" do
    job = build_job
    result = nil
    succeed_stripe! { result = JobFundingService.fund_for_publish!(job) }
    assert result[:success]
    job.reload
    assert job.open?
    assert job.funding_funded?
    ledger = JobLedger.for(job)
    assert_equal 1, job.job_payment_transactions.initial_job_charge.status_succeeded.count
    assert ledger.fully_funded
    assert_equal JobMoney.company_charge_cents(600_000, 10), ledger.company_required_cents
  end

  test "failed payment leaves job unpublished" do
    job = build_job
    failed = JobStripeOps::Result.new(status: "failed", error: "card declined")
    JobStripeOps.stub(:create_payment_intent!, failed) do
      result = JobFundingService.fund_for_publish!(job)
      refute result[:success]
    end
    job.reload
    assert job.pending_funding?
    refute job.open?
  end

  test "counteroffer increase charges only the delta" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    original_required = JobLedger.for(job.reload).company_required_cents
    JobFundingAdjustmentService.apply_accepted_terms!(job: job, hourly_rate_cents: 8_000, hours_per_day: 8, days: 10)
    result = nil
    succeed_stripe! { result = JobFundingAdjustmentService.reconcile!(job, source: "counteroffer", transaction_type_prefix: "counteroffer") }
    assert result[:success]
    new_required = JobMoney.company_charge_cents(640_000, 10)
    delta = new_required - original_required
    assert_equal delta, job.job_payment_transactions.counteroffer_top_up.status_succeeded.sum(:amount_cents)
  end

  test "counteroffer decrease refunds the delta" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    JobFundingAdjustmentService.apply_accepted_terms!(job: job, hourly_rate_cents: 7_000, hours_per_day: 8, days: 10)
    result = nil
    succeed_stripe! { result = JobFundingAdjustmentService.reconcile!(job, source: "counteroffer", transaction_type_prefix: "counteroffer") }
    assert result[:success]
    assert job.job_payment_transactions.counteroffer_refund.status_succeeded.exists?
  end

  test "guaranteed job pay ignores 60 approved hours against 80 estimated" do
    job = build_job(pay_basis: :guaranteed_job_pay)
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    entry = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 2.days.ago,
      worked_end_at: 2.days.ago + 8.hours,
      worked_on_date: 2.days.ago.to_date,
      worked_hours: 60,
      job_timezone: "UTC",
      status: :approved
    )
    entry.create_time_entry_pay_line!(
      job: job,
      base_hourly_rate_cents: 7_500,
      applied_multiplier: 1,
      effective_hourly_rate_cents: 7_500,
      worked_hours: 60,
      gross_pay_cents: 450_000,
      premium_combination_rule: :highest_applicable
    )
    job.update!(status: :finished, finished_at: Time.current)
    JobSettlementService.settle!(job)
    ledger = JobLedger.for(job.reload)
    assert_equal 600_000, ledger.labor_cents
    assert_equal JobMoney.technician_payout_cents(600_000, 20), ledger.technician_net_payout_cents
  end

  test "actual hours under estimate refunds and pays from 60 hours" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    entry = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 2.days.ago,
      worked_end_at: 2.days.ago + 8.hours,
      worked_on_date: 2.days.ago.to_date,
      worked_hours: 60,
      job_timezone: "UTC",
      status: :approved
    )
    entry.create_time_entry_pay_line!(
      job: job,
      base_hourly_rate_cents: 7_500,
      applied_multiplier: 1,
      effective_hourly_rate_cents: 7_500,
      worked_hours: 60,
      gross_pay_cents: 450_000,
      premium_combination_rule: :highest_applicable
    )
    job.update!(status: :finished, finished_at: Time.current)
    succeed_stripe! { JobSettlementService.settle!(job) }
    ledger = JobLedger.for(job.reload)
    assert_equal 450_000, ledger.labor_cents
    assert job.job_payment_transactions.final_hours_refund.status_succeeded.exists?
    assert_equal JobMoney.technician_payout_cents(450_000, 20), ledger.technician_net_payout_cents
  end

  test "actual hours over estimate blocks payout when collection fails" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    entry = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 2.days.ago,
      worked_end_at: 2.days.ago + 8.hours,
      worked_on_date: 2.days.ago.to_date,
      worked_hours: 85,
      job_timezone: "UTC",
      status: :approved
    )
    entry.create_time_entry_pay_line!(
      job: job,
      base_hourly_rate_cents: 7_500,
      applied_multiplier: 1,
      effective_hourly_rate_cents: 7_500,
      worked_hours: 85,
      gross_pay_cents: 637_500,
      premium_combination_rule: :highest_applicable
    )
    job.update!(status: :finished, finished_at: Time.current)
    failed = JobStripeOps::Result.new(status: "failed", error: "card declined")
    JobStripeOps.stub(:create_payment_intent!, failed) do
      result = JobSettlementService.settle!(job)
      refute result[:success]
      refute JobSettlementService.settle_and_release_if_eligible!(job.reload)[:success]
    end
    assert_equal 0, JobLedger.for(job).transferred_cents
  end

  test "duplicate collect is idempotent" do
    job = build_job
    first = second = nil
    succeed_stripe! do
      first = JobFundingService.fund_for_publish!(job)
      second = JobFundingService.collect!(
        job: job.reload,
        amount_cents: first[:transaction].amount_cents,
        transaction_type: :initial_job_charge,
        revision: 1
      )
    end
    assert_equal first[:transaction].id, second[:transaction].id
    assert_equal 1, job.job_payment_transactions.initial_job_charge.status_succeeded.count
  end

  test "account id alone is not payout ready" do
    @tech_profile.update!(
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_transfers_capability_status: "inactive"
    )
    refute StripeConnectAccountService.payout_ready?(@tech_profile)
  end

  test "underfunded job does not release" do
    job = build_job
    succeed_stripe! { JobFundingService.fund_for_publish!(job) }
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    job.update!(status: :finished, finished_at: 4.days.ago, agreed_labor_cents: 9_000_00)
    job.job_payment_transactions.status_succeeded.delete_all
    result = PaymentService.release_to_technician(job.payments.first)
    assert result[:error]
  end

  test "unfunded priced job cannot be claimed" do
    job = build_job
    job.update_columns(status: Job.statuses[:open], funding_status: Job.funding_statuses[:unfunded], go_live_at: 3.days.ago)
    result = Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    assert_match(/not funded/i, result[:error].to_s)
    refute job.reload.filled?
  end

  test "independent 10 and 10 commissions charge 1100 and pay 900" do
    @tech_profile.update!(membership_level: "premium")
    job = build_job(rate: 10_000, hours: 10, days: 10)
    JobFundingService.fund_for_publish!(job)
    Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    ledger = JobLedger.for(job.reload)
    assert_equal 1_000_000, ledger.labor_cents
    assert_equal 100_000, ledger.company_commission_cents
    assert_equal 1_100_000, ledger.company_required_cents
    assert_equal 100_000, ledger.technician_commission_cents
    assert_equal 900_000, ledger.technician_net_payout_cents
  end

  test "asymmetric snapshots are independent of later admin chart changes" do
    job = build_job(rate: 10_000, hours: 10, days: 10)
    JobFundingService.fund_for_publish!(job)
    Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    job.update!(
      company_commission_percent_snapshot: 7,
      technician_commission_percent_snapshot: 15
    )
    MembershipTierConfig.where(audience: "company").update_all(commission_percent: 50)
    MembershipTierConfig.where(audience: "technician").update_all(commission_percent: 50)
    MembershipPolicy.invalidate_cache!

    ledger = JobLedger.for(job.reload)
    assert_equal 1_070_000, ledger.company_required_cents
    assert_equal 850_000, ledger.technician_net_payout_cents
    assert_equal 70_000, ledger.company_commission_cents
    assert_equal 150_000, ledger.technician_commission_cents
  end

  test "membership fee waived still charges the job" do
    @company_profile.update!(membership_fee_waived: true)
    job = build_job
    result = JobFundingService.fund_for_publish!(job)
    assert result[:success]
    refute result[:waived]
    job.reload
    assert job.job_payment_transactions.initial_job_charge.status_succeeded.exists?
    assert_equal JobMoney.company_charge_cents(600_000, 10), JobLedger.for(job).company_required_cents
  end

  test "job funding waived publishes without a charge" do
    @company_profile.update!(job_funding_waived: true)
    job = build_job
    result = JobFundingService.fund_for_publish!(job)
    assert result[:success]
    assert result[:waived]
    assert_equal 0, job.reload.job_payment_transactions.company_collections.status_succeeded.count
    assert job.funding_funded?
  end

  test "missing company snapshot cannot invent a 0 percent charge" do
    job = build_job
    JobFundingService.fund_for_publish!(job)
    job.update_columns(company_commission_percent_snapshot: nil)
    job.job_financial_revisions.update_all(company_commission_percent: nil)
    job.reload
    error = assert_raises(JobLedger::MissingCommissionSnapshotError) { JobLedger.for(job) }
    assert_match(/missing a company commission snapshot/i, error.message)
    result = JobFundingService.collect!(job: job, amount_cents: 1000, transaction_type: :final_hours_top_up, revision: 9)
    assert_match(/missing/i, result[:error].to_s)
  end

  test "stored zero snapshot is an explicit 0 percent fee" do
    job = build_job
    JobFundingService.fund_for_publish!(job)
    job.update!(company_commission_percent_snapshot: 0)
    ledger = JobLedger.for(job.reload)
    assert_equal 0, ledger.company_commission_cents
    assert_equal 600_000, ledger.company_required_cents
  end

  test "missing technician snapshot cannot invent a 0 percent payout" do
    job = build_job
    JobFundingService.fund_for_publish!(job)
    Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    JobFundingService.clear_technician_snapshot!(job)
    job.job_financial_revisions.update_all(technician_commission_percent: nil)
    job.update!(status: :finished, finished_at: 4.days.ago)
    result = PaymentService.release_to_technician(job.payments.first)
    assert_match(/technician commission snapshot is missing/i, result[:error].to_s)
    assert_equal 0, JobLedger.for(job.reload).transferred_cents
  end

  test "actual hours below schedule refunds excess using company snapshot" do
    job = build_job
    JobFundingService.fund_for_publish!(job)
    Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    add_approved_pay_line!(job, gross_cents: 450_000, hours: 60)
    job.update!(status: :finished, finished_at: Time.current)
    JobSettlementService.settle!(job)
    ledger = JobLedger.for(job.reload)
    assert_equal 450_000, ledger.labor_cents
    assert_equal JobMoney.company_charge_cents(450_000, 10), ledger.company_required_cents
    assert job.job_payment_transactions.final_hours_refund.status_succeeded.exists?
    assert_equal JobMoney.technician_payout_cents(450_000, 20), ledger.technician_net_payout_cents
    refute_equal 0, ledger.technician_commission_cents
  end

  test "actual hours above schedule tops up using company snapshot and blocks payout until funded" do
    job = build_job
    JobFundingService.fund_for_publish!(job)
    Jobs::ClaimJobService.call(job: job.reload, technician_user: @tech_user)
    add_approved_pay_line!(job, gross_cents: 637_500, hours: 85)
    job.update!(status: :finished, finished_at: Time.current)
    failed = JobStripeOps::Result.new(status: "failed", error: "card declined")
    JobStripeOps.stub(:create_payment_intent!, failed) do
      result = JobSettlementService.settle!(job)
      refute result[:success]
      refute JobSettlementService.settle_and_release_if_eligible!(job.reload)[:success]
    end
    assert_equal 0, JobLedger.for(job.reload).transferred_cents
  end

  def add_approved_pay_line!(job, gross_cents:, hours:)
    entry = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 2.days.ago,
      worked_end_at: 2.days.ago + 8.hours,
      worked_on_date: 2.days.ago.to_date,
      worked_hours: hours,
      job_timezone: "UTC",
      status: :approved
    )
    entry.create_time_entry_pay_line!(
      job: job,
      base_hourly_rate_cents: job.hourly_rate_cents,
      applied_multiplier: 1,
      effective_hourly_rate_cents: job.hourly_rate_cents,
      worked_hours: hours,
      gross_pay_cents: gross_cents,
      premium_combination_rule: :highest_applicable
    )
  end
end
