# frozen_string_literal: true

require "test_helper"
require "ostruct"

class Stage2AchIntegrityTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "s2-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_stage2_test"
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  test "setup intent creation excludes mandate_data" do
    captured = {}
    Stripe::SetupIntent.stub(:create, ->(params) {
      captured.replace(params)
      OpenStruct.new(client_secret: "seti_secret", id: "seti_1")
    }) do
      StripeCustomerService.stub(:ensure_customer_id!, "cus_stage2_test") do
        CompanyPaymentMethodsService.create_setup_intent!(
          @company_user,
          payment_method_type: "us_bank_account",
          ip_address: "1.2.3.4",
          user_agent: "RSpec"
        )
      end
    end

    refute captured.key?(:mandate_data)
    assert_equal ["us_bank_account"], captured[:payment_method_types]
    assert_equal ["payment_method"], captured.dig(:payment_method_options, :us_bank_account, :financial_connections, :permissions)
  end

  test "stripe mode guard requires test keys in staging" do
    old = Stripe.api_key
    Stripe.api_key = "sk_live_forbidden"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      msg = StripeModeGuard.error_message
      assert_match(/test mode|sk_test/i, msg)
    end
  ensure
    Stripe.api_key = old
  end

  test "demo mode is disabled in staging even if DEMO_MODE true" do
    old = ENV["DEMO_MODE"]
    ENV["DEMO_MODE"] = "true"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      refute DemoMode.enabled?
    end
  ensure
    ENV["DEMO_MODE"] = old
  end

  test "pending stripe refund stays pending not failed" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "refund pending",
      description: "d",
      status: :open,
      funding_status: :funded,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      agreed_labor_cents: 40_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    collection = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :succeeded,
      stripe_payment_intent_id: "pi_ref_pending",
      stripe_charge_id: "ch_ref_pending",
      idempotency_key: "tf_s2_col_#{job.id}",
      revision: 1,
      succeeded_at: Time.current
    )

    pending = JobStripeOps::Result.new(status: "pending", stripe_id: "re_pending_1")
    JobStripeOps.stub(:refund!, pending) do
      result = JobFundingService.refund_slice!(
        job: job,
        amount_cents: 1000,
        payment_intent_id: "pi_ref_pending",
        transaction_type: :final_hours_refund,
        revision: 2
      )
      assert result[:pending]
      refute result[:success]
      txn = job.job_payment_transactions.where(stripe_refund_id: "re_pending_1").last
      assert txn.status_pending?
      refute txn.status_failed?
    end
    assert collection.reload.status_succeeded?
  end

  test "payment_failed after success records risk and does not downgrade" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "post success fail",
      description: "d",
      status: :open,
      funding_status: :funded,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      agreed_labor_cents: 40_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :succeeded,
      stripe_payment_intent_id: "pi_post_success",
      idempotency_key: "tf_s2_ps_#{job.id}",
      revision: 1,
      succeeded_at: Time.current
    )

    pi = OpenStruct.new(
      id: "pi_post_success",
      status: "requires_payment_method",
      latest_charge: "ch_x",
      payment_method: "pm_x",
      last_payment_error: OpenStruct.new(message: "late failure signal"),
      metadata: {}
    )
    JobStripeOps.stub(:payment_method_display, {}) do
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_failed, pi)
    end

    assert txn.reload.status_succeeded?
    assert txn.investigation_required?
    assert PaymentRiskEvent.where(job_id: job.id, risk_kind: "post_success_reversal_unconfirmed").exists?
  end

  test "source_charge_for_transfer uses single charge only" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "source tx",
      description: "d",
      status: :finished,
      funding_status: :funded,
      finished_at: 4.days.ago,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound,
      amount_cents: 44_000, currency: "usd", status: :succeeded, stripe_charge_id: "ch_only",
      stripe_payment_intent_id: "pi_only", idempotency_key: "tf_s2_src1_#{job.id}", revision: 1, succeeded_at: Time.current
    )
    assert_equal "ch_only", PaymentService.source_charge_for_transfer(job)

    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_top_up, direction: :inbound,
      amount_cents: 1100, currency: "usd", status: :succeeded, stripe_charge_id: "ch_two",
      stripe_payment_intent_id: "pi_two", idempotency_key: "tf_s2_src2_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    assert_nil PaymentService.source_charge_for_transfer(job.reload)
  end

  test "setup intent webhook upserts record and ignores failure after success" do
    si_success = OpenStruct.new(
      id: "seti_ok",
      customer: "cus_stage2_test",
      payment_method: "pm_bank",
      status: "succeeded",
      payment_method_types: ["us_bank_account"],
      last_setup_error: nil
    )
    Api::V1::StripeWebhooksController.new.send(:reconcile_setup_intent, si_success, event_type: "setup_intent.succeeded")
    rec = StripeSetupRecord.find_by!(stripe_setup_intent_id: "seti_ok")
    assert_equal "succeeded", rec.status
    assert_equal @company_user.id, rec.user_id

    si_fail = OpenStruct.new(
      id: "seti_ok",
      customer: "cus_stage2_test",
      payment_method: nil,
      status: "canceled",
      payment_method_types: ["us_bank_account"],
      last_setup_error: OpenStruct.new(message: "canceled")
    )
    Api::V1::StripeWebhooksController.new.send(:reconcile_setup_intent, si_fail, event_type: "setup_intent.canceled")
    assert_equal "succeeded", rec.reload.status
  end

  test "open payment risk blocks technician payout" do
    job = Job.create!(
      company_profile: @company_profile,
      title: "risk block",
      description: "d",
      status: :finished,
      funding_status: :funded,
      settlement_status: :settled,
      finished_at: 4.days.ago,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound,
      amount_cents: 44_000, currency: "usd", status: :succeeded, stripe_charge_id: "ch_risk",
      stripe_payment_intent_id: "pi_risk", idempotency_key: "tf_s2_risk_#{job.id}", revision: 1, succeeded_at: Time.current
    )
    tech = User.create!(email: "s2-tech-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tp = TechnicianProfile.create!(
      user: tech, trade_type: "General", availability: "Full-time", membership_level: "basic",
      stripe_account_id: "acct_risk", stripe_charges_enabled: true, stripe_payouts_enabled: true,
      stripe_details_submitted: true, stripe_transfers_capability_status: "active"
    )
    JobApplication.create!(job: job, technician_profile: tp, status: :accepted)
    PaymentRiskEvent.record!(
      job: job,
      risk_kind: "post_success_dispute",
      amount_cents: 44_000,
      admin_note: "test"
    )

    result = PaymentService.release_to_technician(payment)
    assert_match(/financial risk|blocked/i, result[:error].to_s)
  end
end
