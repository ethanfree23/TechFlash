# frozen_string_literal: true

require "test_helper"

class AchPaymentFlowTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "ach-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
    @company_user.update_column(:company_profile_id, @company_profile.id)
    @tech_user = User.create!(
      email: "ach-tech-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    @tech_profile = TechnicianProfile.create!(
      user: @tech_user,
      trade_type: "General",
      availability: "Full-time",
      phone: "713-555-0199",
      membership_level: "basic",
      stripe_account_id: "acct_ach_test",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
  end

  def build_job
    Job.create!(
      company_profile: @company_profile,
      title: "ACH job",
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

  def processing_result
    JobStripeOps::Result.new(
      status: "processing",
      stripe_id: "pi_ach_#{SecureRandom.hex(4)}",
      payment_method_id: "pm_bank_1",
      payment_method_type: "us_bank_account",
      payment_method_last4: "6789",
      payment_method_bank_name: "Chase"
    )
  end

  def success_result(pi_id = nil)
    JobStripeOps::Result.new(
      status: "succeeded",
      stripe_id: pi_id || "pi_card_#{SecureRandom.hex(4)}",
      payment_method_id: "pm_card_1",
      payment_method_type: "card",
      payment_method_last4: "4242",
      payment_method_brand: "visa"
    )
  end

  test "ACH processing leaves job unpublished and not funded in ledger" do
    job = build_job
    result = nil
    JobStripeOps.stub(:create_payment_intent!, processing_result) do
      result = JobFundingService.fund_for_publish!(job)
    end

    assert result[:processing]
    refute result[:success]
    job.reload
    assert job.pending_funding?
    assert job.funding_adjustment_required?
    txn = job.job_payment_transactions.initial_job_charge.last
    assert txn.status_processing?
    assert_equal "us_bank_account", txn.payment_method_type
    assert_equal "6789", txn.payment_method_last4
    assert_equal "Chase", txn.payment_method_bank_name

    ledger = JobLedger.for(job)
    assert_equal 0, ledger.collected_cents
    refute ledger.fully_funded
  end

  test "duplicate ACH collect returns existing processing transaction" do
    job = build_job
    JobStripeOps.stub(:create_payment_intent!, processing_result) do
      first = JobFundingService.fund_for_publish!(job)
      assert first[:processing]
      second = JobFundingService.collect!(
        job: job,
        amount_cents: JobMoney.company_charge_cents(job.reload.agreed_labor_cents, job.company_commission_percent_snapshot),
        transaction_type: :initial_job_charge,
        revision: job.financial_revision
      )
      assert second[:processing]
      assert_equal first[:transaction].id, second[:transaction].id
    end
    assert_equal 1, job.job_payment_transactions.initial_job_charge.count
  end

  test "ACH success webhook publishes job and funds ledger" do
    job = build_job
    pi_id = "pi_ach_success_1"
    JobStripeOps.stub(
      :create_payment_intent!,
      JobStripeOps::Result.new(
        status: "processing",
        stripe_id: pi_id,
        payment_method_id: "pm_bank_1",
        payment_method_type: "us_bank_account",
        payment_method_last4: "6789",
        payment_method_bank_name: "Chase"
      )
    ) do
      JobFundingService.fund_for_publish!(job)
    end

    intent = OpenStruct.new(
      id: pi_id,
      status: "succeeded",
      latest_charge: "ch_ach_1",
      payment_method: "pm_bank_1",
      metadata: {}
    )

    JobStripeOps.stub(:payment_method_display, {
      payment_method_id: "pm_bank_1",
      payment_method_type: "us_bank_account",
      payment_method_last4: "6789",
      payment_method_bank_name: "Chase"
    }) do
      controller = Api::V1::StripeWebhooksController.new
      controller.send(:reconcile_payment_intent_succeeded, intent)
    end

    job.reload
    assert job.open?
    assert job.funding_funded?
    txn = job.job_payment_transactions.initial_job_charge.last
    assert txn.status_succeeded?
    assert JobLedger.for(job).fully_funded
  end

  test "ACH failure webhook marks funding failed" do
    job = build_job
    pi_id = "pi_ach_fail_1"
    JobStripeOps.stub(
      :create_payment_intent!,
      JobStripeOps::Result.new(status: "processing", stripe_id: pi_id, payment_method_type: "us_bank_account")
    ) do
      JobFundingService.fund_for_publish!(job)
    end

    intent = OpenStruct.new(
      id: pi_id,
      status: "requires_payment_method",
      latest_charge: nil,
      payment_method: "pm_bank_1",
      last_payment_error: OpenStruct.new(message: "insufficient funds"),
      metadata: {}
    )
    JobStripeOps.stub(:payment_method_display, { payment_method_id: "pm_bank_1", payment_method_type: "us_bank_account" }) do
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_failed, intent)
    end

    job.reload
    assert job.pending_funding?
    assert job.funding_funding_failed?
    assert job.job_payment_transactions.initial_job_charge.last.status_failed?
  end

  test "technician payout blocked while ACH collection is processing" do
    job = build_job
    succeed = success_result
    JobStripeOps.stub(:create_payment_intent!, succeed) do
      JobFundingService.fund_for_publish!(job)
    end
    job.reload
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    JobFundingService.snapshot_technician!(job, @tech_profile)
    job.update!(status: :finished, finished_at: 4.days.ago, settlement_status: :settled, funding_status: :funded)

    payment = job.payments.order(:id).first
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :final_hours_top_up,
      direction: :inbound,
      amount_cents: 100,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      idempotency_key: "tf_job_#{job.id}_processing_guard",
      revision: job.financial_revision + 1,
      processing_at: Time.current
    )

    result = PaymentService.release_to_technician(payment)
    assert result[:error].to_s.downcase.include?("processing")
    refute job.job_payment_transactions.technician_transfer.status_succeeded.exists?
  end

  test "technician payout blocked when collection is disputed" do
    job = build_job
    JobStripeOps.stub(:create_payment_intent!, success_result) do
      JobFundingService.fund_for_publish!(job)
    end
    job.reload
    JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
    JobFundingService.snapshot_technician!(job, @tech_profile)
    job.update!(status: :finished, finished_at: 4.days.ago, settlement_status: :settled, funding_status: :funded)

    txn = job.job_payment_transactions.initial_job_charge.status_succeeded.last
    txn.update!(dispute_status: "needs_response", stripe_dispute_id: "dp_test_1")

    result = PaymentService.release_to_technician(job.payments.order(:id).first)
    assert result[:error].to_s.downcase.include?("disputed")
  end

  test "card funding still publishes immediately" do
    job = build_job
    result = nil
    JobStripeOps.stub(:create_payment_intent!, success_result) do
      result = JobFundingService.fund_for_publish!(job)
    end
    assert result[:success]
    job.reload
    assert job.open?
    assert job.funding_funded?
    assert_equal "card", job.job_payment_transactions.initial_job_charge.last.payment_method_type
  end

  test "processing status is distinct from succeeded for ledger math" do
    job = build_job
    JobFundingService.snapshot_company!(job)
    job.update!(financial_revision: 1, agreed_labor_cents: 600_000, company_commission_percent_snapshot: 10)
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 660_000,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      idempotency_key: "tf_job_#{job.id}_proc_ledger",
      revision: 1,
      processing_at: Time.current
    )
    ledger = JobLedger.for(job.reload)
    assert_equal 0, ledger.collected_cents
    refute ledger.fully_funded
  end
end
