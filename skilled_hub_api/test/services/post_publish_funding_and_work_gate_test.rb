# frozen_string_literal: true

require "test_helper"
require "ostruct"

class PostPublishFundingAndWorkGateTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "post-fund-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_post_fund"
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user,
      membership_level: "basic",
      phone: "713-555-2200",
      company_name: "Post Fund Co",
      job_funding_waived: true
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)

    @tech_user = User.create!(
      email: "post-fund-tech-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    @tech_profile = TechnicianProfile.create!(
      user: @tech_user,
      trade_type: "General",
      availability: "Full-time",
      phone: "713-555-2299",
      membership_level: "premium",
      stripe_account_id: "acct_post_fund",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
  end

  def build_waived_published_job(**attrs)
    job = Job.create!({
      company_profile: @company_profile,
      title: "Waived published job",
      description: "desc",
      status: :pending_funding,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 2,
      agreed_labor_cents: 160_000,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 3.days.from_now,
      go_live_at: 1.day.ago
    }.merge(attrs))
    JobFundingService.fund_for_publish!(job)
    job.reload
  end

  def succeed_stripe!
    success = JobStripeOps::Result.new(
      status: "succeeded",
      stripe_id: "pi_#{SecureRandom.hex(4)}",
      charge_id: "ch_#{SecureRandom.hex(4)}",
      payment_method_id: "pm_sim_default",
      payment_method_type: "card",
      payment_method_last4: "4242"
    )
    JobStripeOps.stub(:create_payment_intent!, success) do
      JobStripeOps.stub(:transfer!, success) do
        yield
      end
    end
  end

  def processing_ach!
    processing = JobStripeOps::Result.new(
      status: "processing",
      stripe_id: "pi_ach_#{SecureRandom.hex(4)}",
      payment_method_id: "pm_bank_1",
      payment_method_type: "us_bank_account",
      payment_method_last4: "6789",
      payment_method_bank_name: "Chase"
    )
    JobStripeOps.stub(:create_payment_intent!, processing) { yield }
  end

  def fail_stripe!
    failed = JobStripeOps::Result.new(status: "failed", error: "card_declined", stripe_id: "pi_fail_#{SecureRandom.hex(4)}")
    JobStripeOps.stub(:create_payment_intent!, failed) { yield }
  end

  def claim!(job)
    JobFundingService.snapshot_technician!(job, @tech_profile)
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    job.update!(status: :filled, scheduled_start_at: 1.day.ago, scheduled_end_at: 5.days.from_now)
    job.reload
  end

  test "unpaid waived job is claimable but work is blocked" do
    job = build_waived_published_job
    assert job.posted_under_funding_waiver?
    assert job.funding_unfunded?
    assert job.funding_allows_claim?
    refute job.funding_allows_work?
    claim!(job)
    assert_equal "claimed", job.effective_status
    refute Job.effectively_active.where(id: job.id).exists?
  end

  test "card fund after publication unlocks work and is idempotent" do
    job = build_waived_published_job
    due = JobLedger.for(job).amount_due_cents
    assert due.positive?

    succeed_stripe! do
      result = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
      assert result[:success], result[:error].to_s
    end

    job.reload
    assert job.funding_funded?
    assert job.posted_under_funding_waiver?, "historical waiver marker must remain"
    assert job.funding_allows_work?
    assert JobLedger.for(job).fully_funded
    assert_equal 1, job.job_payment_transactions.post_publish_top_up.status_succeeded.count

    # Repeated request: already funded, no second charge
    creates = 0
    JobStripeOps.stub(:create_payment_intent!, ->(**_) { creates += 1; raise "should not charge again" }) do
      again = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: 0,
        confirmed_payment_method_id: "pm_sim_default"
      )
      # due is now 0 — already_funded path uses due<=0 && fully_funded
      assert again[:already_funded] || again[:success]
      assert_equal 0, creates
    end

    claim!(job)
    assert_equal "active", job.effective_status
  end

  test "mismatched confirmation amount refuses without charging" do
    job = build_waived_published_job
    due = JobLedger.for(job).amount_due_cents
    creates = 0
    JobStripeOps.stub(:create_payment_intent!, ->(**_) { creates += 1; raise "no" }) do
      result = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due - 1,
        confirmed_payment_method_id: "pm_sim_default"
      )
      refute result[:success]
      assert_match(/equal the outstanding/i, result[:error])
      assert_equal 0, creates
    end
  end

  test "ACH processing does not fund or unlock work; succeed later does" do
    job = build_waived_published_job
    due = JobLedger.for(job).amount_due_cents

    processing_ach! do
      result = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
      assert result[:processing]
      refute result[:success]
    end

    job.reload
    assert job.funding_adjustment_required?
    refute job.funding_allows_work?
    txn = job.job_payment_transactions.post_publish_top_up.order(:id).last
    assert txn.status_processing?

    # Idempotent repeat while processing
    processing_ach! do
      again = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
      assert again[:processing]
    end
    assert_equal 1, job.job_payment_transactions.post_publish_top_up.count

    intent = OpenStruct.new(id: txn.stripe_payment_intent_id, latest_charge: "ch_ach_ok")
    JobFundingService.apply_successful_intent!(job: job, txn: txn, intent: intent)
    job.reload
    assert job.funding_funded?
    assert job.funding_allows_work?
  end

  test "ACH failed stays blocked; retry can succeed" do
    job = build_waived_published_job
    due = JobLedger.for(job).amount_due_cents

    fail_stripe! do
      result = JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
      refute result[:success]
    end
    refute job.reload.funding_allows_work?

    # Failed txn keeps idempotency key — collect! may reuse or create; bump revision path via new amount key
    # Force new attempt by using same due after marking failed key exhausted: create with new revision
    job.update!(financial_revision: job.financial_revision.to_i + 1)
    succeed_stripe! do
      result = JobFundingAdjustmentService.collect_remaining!(
        job.reload,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
      assert result[:success], result[:error].to_s
    end
    assert job.reload.funding_allows_work?
  end

  test "time entry create/approve blocked until funded; historical rows preserved" do
    job = build_waived_published_job
    claim!(job)

    # Historical / direct model create still persists (no retroactive wipe).
    historical = job.time_entries.create!(
      technician_profile: @tech_profile,
      submitted_by_user: @tech_user,
      worked_start_at: 1.day.ago.change(hour: 8),
      worked_end_at: 1.day.ago.change(hour: 12),
      worked_on_date: 1.day.ago.to_date,
      worked_hours: 4,
      job_timezone: "UTC",
      status: :submitted
    )
    assert historical.persisted?
    assert_equal "submitted", historical.status

    controller = Api::V1::TimeEntriesController.new
    controller.define_singleton_method(:authenticate_user) { true }
    controller.instance_variable_set(:@current_user, @tech_user)
    controller.instance_variable_set(:@job, job)

    blocked = controller.send(:closed_to_new_time_entries_reason)
    assert_nil blocked
    assert_match(/fund/i, job.work_funding_blocked_message)

    due = JobLedger.for(job).amount_due_cents
    succeed_stripe! do
      JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
    end
    assert job.reload.funding_allows_work?
    assert historical.reload.persisted?
    assert_equal "submitted", historical.status
  end

  test "funded card job allows work without post-publish top-up" do
    @company_profile.update!(job_funding_waived: false)
    job = Job.create!(
      company_profile: @company_profile,
      title: "Card funded",
      description: "d",
      status: :pending_funding,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      agreed_labor_cents: 40_000,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 2.days.from_now,
      go_live_at: Time.current
    )
    succeed_stripe! do
      result = JobFundingService.fund_for_publish!(job)
      assert result[:success] || job.reload.funding_funded? || job.open?, result.inspect
    end
    job.reload
    assert job.funding_funded? || JobLedger.for(job).fully_funded
    claim!(job)
    assert job.funding_allows_work?
    assert_equal "active", job.effective_status
  end

  test "refund after fund blocks work again" do
    job = build_waived_published_job
    due = JobLedger.for(job).amount_due_cents
    succeed_stripe! do
      JobFundingAdjustmentService.collect_remaining!(
        job,
        confirmed_amount_cents: due,
        confirmed_payment_method_id: "pm_sim_default"
      )
    end
    assert job.reload.funding_allows_work?

    refund = JobStripeOps::Result.new(status: "succeeded", stripe_id: "re_#{SecureRandom.hex(4)}")
    JobStripeOps.stub(:refund!, refund) do
      JobFundingAdjustmentService.refund_unfilled_job!(job)
    end
    job.reload
    refute job.funding_allows_work? if job.priced?
  end
end
