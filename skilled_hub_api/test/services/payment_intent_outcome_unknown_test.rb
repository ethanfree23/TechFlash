# frozen_string_literal: true

require "test_helper"

class PaymentIntentOutcomeUnknownTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "pi-unknown-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def build_job
    Job.create!(
      company_profile: @company_profile,
      title: "Outcome unknown job",
      description: "desc",
      status: :pending_funding,
      pay_basis: :guaranteed_job_pay,
      hourly_rate_cents: 7_500,
      hours_per_day: 8,
      days: 10,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 12.days.from_now,
      go_live_at: 3.days.ago
    )
  end

  def unknown_result
    JobStripeOps::Result.new(
      status: "outcome_unknown",
      error: "Net::ReadTimeout",
      error_class: "Stripe::APIConnectionError"
    )
  end

  test "timeout on PI create marks txn outcome_unknown and leaves job pending_funding" do
    job = build_job
    result = nil
    JobStripeOps.stub(:create_payment_intent!, unknown_result) do
      result = JobFundingService.fund_for_publish!(job)
    end

    assert result[:outcome_unknown]
    refute result[:success]
    job.reload
    assert job.pending_funding?
    assert job.funding_adjustment_required?

    txn = job.job_payment_transactions.initial_job_charge.last
    assert txn.status_outcome_unknown?
    assert txn.investigation_required?
    assert PaymentRiskEvent.exists?(job_id: job.id, lifecycle_state: "outcome_unknown")
    refute JobLedger.for(job).fully_funded
  end

  test "immediate retry does not create a second Stripe call while outcome_unknown" do
    job = build_job
    calls = 0
    stub = ->(*) { calls += 1; unknown_result }
    JobStripeOps.stub(:create_payment_intent!, stub) do
      JobFundingService.fund_for_publish!(job)
      JobFundingService.collect!(
        job: job,
        amount_cents: JobMoney.company_charge_cents(job.reload.agreed_labor_cents, job.company_commission_percent_snapshot),
        transaction_type: :initial_job_charge,
        revision: job.financial_revision
      )
    end
    assert_equal 1, calls
    assert_equal 1, job.job_payment_transactions.initial_job_charge.count
  end

  test "processing webhook recovers failed txn without pi via metadata transaction_id" do
    job = build_job
    JobFundingService.snapshot_company!(job)
    job.update!(financial_revision: 1, company_commission_percent_snapshot: 10, agreed_labor_cents: 600_000)
    payment = JobFundingService.ensure_header!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 660_000,
      currency: "usd",
      status: :failed,
      payment_method_type: "us_bank_account",
      idempotency_key: "tf_job_#{job.id}_ambiguous",
      revision: 1,
      error_message: "timeout"
    )

    pi_id = "pi_recover_#{SecureRandom.hex(4)}"
    intent = OpenStruct.new(
      id: pi_id,
      status: "processing",
      latest_charge: nil,
      payment_method: "pm_bank_1",
      metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s }
    )

    JobStripeOps.stub(:payment_method_display, { payment_method_id: "pm_bank_1", payment_method_type: "us_bank_account" }) do
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_processing, intent)
    end

    txn.reload
    job.reload
    assert txn.status_processing?
    assert_equal pi_id, txn.stripe_payment_intent_id
    assert txn.investigation_required?
    assert job.pending_funding?
  end
end
