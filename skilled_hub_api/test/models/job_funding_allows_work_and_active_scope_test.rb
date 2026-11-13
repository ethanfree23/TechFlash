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

  def assert_active_parity!(job)
    job.reload
    allows = job.funding_allows_work?
    in_scope = Job.effectively_active.where(id: job.id).exists?
    assert_equal allows, in_scope,
                 "effectively_active inclusion (#{in_scope}) must match funding_allows_work? (#{allows}) for job #{job.id}"
    if allows && job.scheduled_start_at.present? && job.scheduled_start_at <= Time.current
      assert_equal "active", job.effective_status
    elsif job.reserved? || job.filled? || job.accepted?
      assert_equal "claimed", job.effective_status unless allows
    end
  end

  def succeeded_collection!(job, amount_cents:, type: :post_publish_top_up, payment_method_type: "card")
    payment = job.payments.first || Payment.create!(job: job, amount_cents: amount_cents, status: "held", currency: "usd")
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: type,
      direction: :inbound,
      amount_cents: amount_cents,
      currency: "usd",
      status: :succeeded,
      payment_method_type: payment_method_type,
      stripe_payment_intent_id: "pi_#{SecureRandom.hex(4)}",
      stripe_charge_id: "ch_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_scope_#{job.id}_#{SecureRandom.hex(4)}",
      revision: job.financial_revision
    )
  end

  def refund!(job, amount_cents:)
    payment = job.payments.first
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :refund,
      direction: :outbound,
      amount_cents: amount_cents,
      currency: "usd",
      status: :succeeded,
      stripe_payment_intent_id: "pi_ref_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_ref_#{job.id}_#{SecureRandom.hex(4)}",
      revision: job.financial_revision
    )
  end

  test "fully paid card job is active and in scope" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required, payment_method_type: "card")
    assert job.reload.funding_allows_work?
    assert_active_parity!(job)
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
    assert_active_parity!(job)
  end

  test "ACH succeeded is active and in scope" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required, payment_method_type: "us_bank_account")
    assert job.reload.funding_allows_work?
    assert_active_parity!(job)
  end

  test "open dispute or return blocks work and scope" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    txn = succeeded_collection!(job, amount_cents: required)
    assert job.reload.funding_allows_work?
    txn.update!(dispute_status: "needs_response")
    refute job.reload.funding_allows_work?
    assert_active_parity!(job)
  end

  test "partially refunded job is not active" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required)
    refund!(job, amount_cents: (required / 2.0).ceil)
    job.update!(funding_status: :adjustment_required)
    refute job.reload.funding_allows_work?
    assert_active_parity!(job)
  end

  test "stale funded label with shortfall is never active" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: [required / 2, 1].max)
    refute job.reload.funding_allows_work?
    assert_active_parity!(job)
  end

  test "missing commission snapshot is never active" do
    job = claimed_started_job(
      funding_status: :funded,
      company_commission_percent_snapshot: nil
    )
    # No revision recovery either.
    job.job_financial_revisions.delete_all
    refute job.funding_allows_work?
    assert_active_parity!(job)
  end

  test "zero-required unpriced job can be active without cash" do
    job = claimed_started_job(
      hourly_rate_cents: 0,
      hours_per_day: 0,
      days: 0,
      price_cents: 0,
      agreed_labor_cents: 0,
      funding_status: :funded,
      company_commission_percent_snapshot: nil
    )
    assert job.funding_allows_work?
    assert_active_parity!(job)
  end

  test "guaranteed-job-pay fully funded is active" do
    job = claimed_started_job(
      pay_basis: :guaranteed_job_pay,
      funding_status: :funded,
      agreed_labor_cents: 80_000,
      hourly_rate_cents: 10_000,
      hours_per_day: 8,
      days: 1
    )
    required = JobLedger.for(job).company_required_cents
    assert_equal JobMoney.company_charge_cents(80_000, 10), required
    succeeded_collection!(job, amount_cents: required)
    assert job.reload.funding_allows_work?
    assert_active_parity!(job)
  end

  test "multiple collections and refunds use net ledger for parity" do
    job = claimed_started_job(funding_status: :funded)
    required = JobLedger.for(job).company_required_cents
    succeeded_collection!(job, amount_cents: required)
    succeeded_collection!(job, amount_cents: 5_000) # overcollect
    refund!(job, amount_cents: 5_000) # back to exact
    assert JobLedger.for(job.reload).fully_funded
    assert job.funding_allows_work?
    assert_active_parity!(job)

    refund!(job, amount_cents: 1_000) # shortfall
    refute job.reload.funding_allows_work?
    assert_active_parity!(job)
  end
end
