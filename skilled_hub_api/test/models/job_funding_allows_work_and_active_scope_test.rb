# frozen_string_literal: true

require "test_helper"

class JobFundingAllowsWorkAndActiveScopeTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "work-gate-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user, membership_level: "basic", phone: "713-555-3300", company_name: "Work Gate Co"
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def claimed_started_job(**attrs)
    Job.create!({
      company_profile: @company_profile,
      title: "Active scope job",
      description: "d",
      status: :filled,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 5_000,
      hours_per_day: 8,
      days: 1,
      agreed_labor_cents: 40_000,
      company_commission_percent_snapshot: 10,
      funding_status: :unfunded,
      scheduled_start_at: 1.day.ago,
      scheduled_end_at: 3.days.from_now,
      go_live_at: 2.days.ago,
      financial_revision: 1
    }.merge(attrs))
  end

  def succeeded_collection!(job, amount_cents:)
    payment = Payment.create!(job: job, amount_cents: amount_cents, status: "held", currency: "usd")
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :post_publish_top_up,
      direction: :inbound,
      amount_cents: amount_cents,
      currency: "usd",
      status: :succeeded,
      payment_method_type: "card",
      stripe_payment_intent_id: "pi_#{SecureRandom.hex(4)}",
      stripe_charge_id: "ch_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_scope_#{job.id}_#{SecureRandom.hex(4)}",
      revision: job.financial_revision
    )
  end

  test "stale funded status with shortfall is never active" do
    job = claimed_started_job(funding_status: :funded)
    # Only partial collection — shortfall remains.
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: [required / 2, 1].max)
    job.reload

    refute job.funding_allows_work?
    assert_equal "claimed", job.effective_status
    refute_includes Job.effectively_active.ids, job.id
    assert_includes Job.effectively_claimed.ids, job.id
  end

  test "ACH processing is not funded or active" do
    job = claimed_started_job(funding_status: :adjustment_required)
    payment = Payment.create!(job: job, amount_cents: 44_000, status: "pending", currency: "usd")
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :post_publish_top_up,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      stripe_payment_intent_id: "pi_proc_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_proc_#{job.id}_#{SecureRandom.hex(4)}",
      revision: 1
    )

    refute job.funding_allows_work?
    assert_equal "claimed", job.effective_status
    refute_includes Job.effectively_active.ids, job.id
  end

  test "refunded cash removes work eligibility" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required)
    assert job.reload.funding_allows_work?
    assert_includes Job.effectively_active.ids, job.id

    payment = job.payments.first
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :refund,
      direction: :outbound,
      amount_cents: required,
      currency: "usd",
      status: :succeeded,
      stripe_payment_intent_id: "pi_ref_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_ref_#{job.id}_#{SecureRandom.hex(4)}",
      revision: 1
    )
    job.update!(funding_status: :unfunded)

    refute job.reload.funding_allows_work?
    assert_equal "claimed", job.effective_status
    refute_includes Job.effectively_active.ids, job.id
  end

  test "return or dispute blocks work even if collection still succeeded" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    txn = succeeded_collection!(job, amount_cents: required)
    assert job.reload.funding_allows_work?

    txn.update!(dispute_status: "needs_response")
    refute job.reload.funding_allows_work?
    assert_equal "claimed", job.effective_status
    refute_includes Job.effectively_active.ids, job.id
  end

  test "zero-required unpriced job can be active without cash" do
    job = claimed_started_job(
      hourly_rate_cents: 0,
      hours_per_day: 0,
      days: 0,
      price_cents: 0,
      agreed_labor_cents: 0,
      funding_status: :funded
    )
    assert job.funding_allows_work?
    assert_equal "active", job.effective_status
    assert_includes Job.effectively_active.ids, job.id
  end

  test "fully funded priced job is active" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required)
    assert job.reload.funding_allows_work?
    assert_equal "active", job.effective_status
    assert_includes Job.effectively_active.ids, job.id
  end
end
