# frozen_string_literal: true

require "test_helper"

class JobFinancialDeleteGuardTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "del-guard-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company
    )
    @cp = CompanyProfile.create!(user: @user, membership_level: "basic", company_name: "Del Guard", phone: "713-555-4400")
    @user.update_column(:company_profile_id, @cp.id)
  end

  def empty_job
    Job.create!(
      company_profile: @cp,
      title: "empty unfunded",
      description: "d",
      status: :open,
      hourly_rate_cents: 0,
      hours_per_day: 0,
      days: 0,
      price_cents: 0,
      agreed_labor_cents: 0,
      go_live_at: Time.current
    )
  end

  test "empty unfunded job remains deletable via destroy and controller guard" do
    job = empty_job
    assert_nil job.financial_undeletable_reason
    controller = Api::V1::JobsController.new
    assert_nil controller.send(:undeletable_reason, job)
    assert job.destroy
  end

  test "processing JobPaymentTransaction blocks model destroy and company cascade" do
    job = empty_job
    job.update!(hourly_rate_cents: 5000, hours_per_day: 8, days: 1, agreed_labor_cents: 40_000)
    payment = Payment.create!(job: job, amount_cents: 44_000, status: "pending", currency: "usd")
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      stripe_payment_intent_id: "pi_del_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_del_#{job.id}_#{SecureRandom.hex(4)}",
      revision: 1
    )

    assert_match(/payment activity/i, job.financial_undeletable_reason)
    refute job.destroy
    assert Job.exists?(job.id)

    # Company profile cascade must not wipe the financially significant job.
    refute @cp.destroy
    assert Job.exists?(job.id)
    assert JobPaymentTransaction.exists?(payment.job_payment_transactions.first.id)
  end

  test "payment row alone blocks destroy" do
    job = empty_job
    Payment.create!(job: job, amount_cents: 100, status: "pending", currency: "usd")
    assert_match(/payment records/i, job.financial_undeletable_reason)
    refute job.destroy
  end

  test "financial revision alone blocks destroy" do
    job = empty_job
    job.update!(company_commission_percent_snapshot: 10, agreed_labor_cents: 40_000, financial_revision: 1)
    JobFinancialRevision.create!(
      job: job,
      revision_number: 1,
      source: "posting",
      company_commission_percent: 10
    )
    assert_match(/financial revision/i, job.financial_undeletable_reason)
    refute job.destroy
    assert Job.exists?(job.id)
  end

  test "payment risk event alone blocks destroy" do
    job = empty_job
    PaymentRiskEvent.create!(
      job: job,
      risk_kind: "pre_success_failure",
      amount_cents: 100,
      correlation_key: "risk:#{job.id}:#{SecureRandom.hex(4)}",
      detected_at: Time.current,
      investigation_status: "open",
      lifecycle_state: "outcome_unknown"
    )
    assert_match(/payment risk/i, job.financial_undeletable_reason)
    refute job.destroy
    assert PaymentRiskEvent.where(job_id: job.id).exists?
  end
end
