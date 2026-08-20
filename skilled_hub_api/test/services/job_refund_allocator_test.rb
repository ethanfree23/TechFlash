require "test_helper"

class JobRefundAllocatorTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(email: "refund-co-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def build_funded_job
    job = Job.create!(
      company_profile: @company_profile,
      title: "Refund job",
      description: "desc",
      status: :pending_funding,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 10_000,
      hours_per_day: 10,
      days: 10,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 12.days.from_now
    )
    JobFundingService.fund_for_publish!(job)
    job.reload
  end

  def add_collection!(job, amount_cents:, pi_id:)
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :counteroffer_top_up,
      direction: :inbound,
      amount_cents: amount_cents,
      currency: "usd",
      status: :succeeded,
      stripe_payment_intent_id: pi_id,
      idempotency_key: "tf_test_#{job.id}_#{pi_id}_#{SecureRandom.hex(3)}",
      revision: job.financial_revision,
      succeeded_at: Time.current
    )
  end

  test "one PI partial refund" do
    job = build_funded_job
    pi = job.job_payment_transactions.initial_job_charge.status_succeeded.first.stripe_payment_intent_id
    result = JobFundingService.refund_delta!(job: job, amount_cents: 50_000, transaction_type: :refund, revision: 2)
    assert result[:success]
    txn = result[:transaction]
    assert_equal 50_000, txn.amount_cents
    assert_equal pi, txn.stripe_payment_intent_id
    assert txn.status_succeeded?
  end

  test "one PI full refund" do
    job = build_funded_job
    collected = JobLedger.for(job).collected_cents
    result = JobFundingService.refund_delta!(job: job, amount_cents: collected, transaction_type: :refund, revision: 2)
    assert result[:success]
    assert_equal 0, JobRefundAllocator.new(job: job.reload, amount_cents: 1).remaining_total
  end

  test "two PIs refund smaller than newest PI" do
    job = build_funded_job
    add_collection!(job, amount_cents: 30_000, pi_id: "pi_newer_small")
    result = JobFundingService.refund_delta!(job: job.reload, amount_cents: 10_000, transaction_type: :final_hours_refund, revision: 3)
    assert result[:success]
    assert_equal "pi_newer_small", result[:transaction].stripe_payment_intent_id
    assert_equal 10_000, result[:transaction].amount_cents
  end

  test "two PIs refund larger than newest PI" do
    job = build_funded_job
    add_collection!(job, amount_cents: 30_000, pi_id: "pi_newer_large")
    original_pi = job.job_payment_transactions.initial_job_charge.status_succeeded.first.stripe_payment_intent_id
    result = JobFundingService.refund_delta!(job: job.reload, amount_cents: 80_000, transaction_type: :final_hours_refund, revision: 3)
    assert result[:success]
    slices = job.job_payment_transactions.final_hours_refund.status_succeeded.order(:id)
    assert_equal 2, slices.count
    assert_equal "pi_newer_large", slices.first.stripe_payment_intent_id
    assert_equal 30_000, slices.first.amount_cents
    assert_equal original_pi, slices.second.stripe_payment_intent_id
    assert_equal 50_000, slices.second.amount_cents
  end

  test "previous partial refund plus another refund" do
    job = build_funded_job
    add_collection!(job, amount_cents: 30_000, pi_id: "pi_newer_partial")
    first = JobFundingService.refund_delta!(job: job.reload, amount_cents: 10_000, transaction_type: :refund, revision: 3)
    assert first[:success]
    second = JobFundingService.refund_delta!(job: job.reload, amount_cents: 25_000, transaction_type: :refund, revision: 4)
    assert second[:success]
    remaining = JobRefundAllocator.new(job: job.reload, amount_cents: 1).remaining_by_pi
    assert_equal 0, remaining["pi_newer_partial"]
  end

  test "retrying the same refund request is idempotent" do
    job = build_funded_job
    first = JobFundingService.refund_delta!(job: job, amount_cents: 40_000, transaction_type: :refund, revision: 8)
    second = JobFundingService.refund_delta!(job: job.reload, amount_cents: 40_000, transaction_type: :refund, revision: 8)
    assert first[:success]
    assert second[:success]
    assert_equal first[:transaction].id, second[:transaction].id
    assert_equal 1, job.job_payment_transactions.where(transaction_type: :refund, status: :succeeded, revision: 8).count
  end

  test "refuses to refund more than remaining" do
    job = build_funded_job
    collected = JobLedger.for(job).net_funded_cents
    result = JobFundingService.refund_delta!(job: job, amount_cents: collected + 1, transaction_type: :refund, revision: 9)
    refute result[:success]
    assert_match(/exceeds remaining/i, result[:error])
  end
end
