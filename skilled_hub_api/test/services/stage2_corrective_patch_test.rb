# frozen_string_literal: true

require "test_helper"
require "ostruct"

class Stage2CorrectivePatchTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "s2c-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_s2c_test"
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def build_funded_job(title:, charge_id: "ch_one", amount: 44_000, pm_type: "us_bank_account")
    job = Job.create!(
      company_profile: @company_profile,
      title: title,
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
    txn = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: amount,
      currency: "usd",
      status: :succeeded,
      stripe_charge_id: charge_id,
      stripe_payment_intent_id: "pi_#{SecureRandom.hex(4)}",
      payment_method_type: pm_type,
      idempotency_key: "tf_s2c_#{SecureRandom.hex(6)}",
      revision: 1,
      succeeded_at: Time.current
    )
    [job, payment, txn]
  end

  # --- source_transaction allocation ---

  test "single valid collection yields source charge" do
    job, _payment, _txn = build_funded_job(title: "src ok", charge_id: "ch_ok", amount: 50_000)
    decision = PaymentService.source_transaction_decision(job, amount_cents: 10_000)
    assert_equal "ch_ok", decision[:charge_id]
    assert_equal "single_charge", decision[:mode]
  end

  test "insufficient allocatable funds falls back to platform balance" do
    job, payment, _txn = build_funded_job(title: "src short", charge_id: "ch_short", amount: 5_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_refund, direction: :outbound,
      amount_cents: 4_500, currency: "usd", status: :succeeded,
      idempotency_key: "tf_s2c_ref_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 2_000)
    assert_nil decision[:charge_id]
    assert_equal "insufficient_allocatable_source", decision[:reason]
  end

  test "two collections with different charge ids use option B" do
    job, payment, _txn = build_funded_job(title: "src multi", charge_id: "ch_a", amount: 20_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_top_up, direction: :inbound,
      amount_cents: 5_000, currency: "usd", status: :succeeded, stripe_charge_id: "ch_b",
      stripe_payment_intent_id: "pi_b", idempotency_key: "tf_s2c_b_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 1_000)
    assert_nil decision[:charge_id]
    assert_equal "multiple_source_charges", decision[:reason]
  end

  test "two collections one missing charge id fails closed to option B" do
    job, payment, _txn = build_funded_job(title: "src miss", charge_id: "ch_only", amount: 20_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_top_up, direction: :inbound,
      amount_cents: 5_000, currency: "usd", status: :succeeded, stripe_charge_id: nil,
      stripe_payment_intent_id: "pi_miss", idempotency_key: "tf_s2c_miss_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 1_000)
    assert_nil decision[:charge_id]
    assert_equal "collection_missing_charge_id", decision[:reason]
  end

  test "pending refund reserves allocatable source funds" do
    job, payment, _txn = build_funded_job(title: "src pend", charge_id: "ch_pend", amount: 10_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_refund, direction: :outbound,
      amount_cents: 8_000, currency: "usd", status: :pending,
      idempotency_key: "tf_s2c_pend_#{job.id}", revision: 2
    )
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 3_000)
    assert_nil decision[:charge_id]
    assert_equal "insufficient_allocatable_source", decision[:reason]
  end

  test "existing transfer reduces allocatable source" do
    job, payment, _txn = build_funded_job(title: "src xfer", charge_id: "ch_xfer", amount: 10_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 9_000, currency: "usd", status: :succeeded, source_charge_id: "ch_xfer",
      idempotency_key: "tf_s2c_xfer_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 2_000)
    assert_nil decision[:charge_id]
    assert_equal "insufficient_allocatable_source", decision[:reason]
  end

  test "payment intent id shape is rejected as source charge" do
    job, _payment, txn = build_funded_job(title: "src pi", charge_id: "pi_not_a_charge", amount: 10_000)
    decision = PaymentService.source_transaction_decision(job, amount_cents: 1_000)
    assert_nil decision[:charge_id]
    assert_equal "invalid_charge_id_shape", decision[:reason]
    assert txn.stripe_charge_id.start_with?("pi_")
  end

  test "currency mismatch rejects source_transaction" do
    job, payment, txn = build_funded_job(title: "src cur", charge_id: "ch_cur", amount: 10_000)
    txn.update_columns(currency: "eur")
    decision = PaymentService.source_transaction_decision(job.reload, amount_cents: 1_000)
    assert_nil decision[:charge_id]
    assert_equal "currency_mismatch", decision[:reason]
    assert payment.present?
  end

  # --- dispute lifecycle / risk dedup ---

  test "dispute created updated closed updates one risk record" do
    job, _payment, txn = build_funded_job(title: "disp life", charge_id: "ch_disp", pm_type: "card")
    dispute = OpenStruct.new(
      id: "dp_life_1",
      charge: "ch_disp",
      payment_intent: txn.stripe_payment_intent_id,
      status: "needs_response",
      reason: "fraudulent",
      amount: 44_000
    )
    ctrl = Api::V1::StripeWebhooksController.new
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.created", stripe_event_id: "evt_1")
    dispute.status = "under_review"
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.updated", stripe_event_id: "evt_2")
    dispute.status = "won"
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.closed", stripe_event_id: "evt_3")

    risks = PaymentRiskEvent.where(stripe_dispute_id: "dp_life_1")
    assert_equal 1, risks.count
    rec = risks.first
    assert_equal "post_success_dispute", rec.risk_kind
    assert_equal "dispute_won", rec.lifecycle_state
    assert_equal "reviewing", rec.investigation_status
    assert PaymentRiskEvent.open_for_job?(job)
  end

  test "ach dispute is confirmed return and deduped" do
    job, _payment, txn = build_funded_job(title: "ach ret", charge_id: "ch_ach_ret", pm_type: "us_bank_account")
    dispute = OpenStruct.new(
      id: "dp_ach_1",
      charge: "ch_ach_ret",
      payment_intent: txn.stripe_payment_intent_id,
      status: "lost",
      reason: "debit_not_authorized",
      amount: 44_000
    )
    ctrl = Api::V1::StripeWebhooksController.new
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.created", stripe_event_id: "evt_a1")
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.created", stripe_event_id: "evt_a1_dup")
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.funds_withdrawn", stripe_event_id: "evt_a2")

    assert_equal 1, PaymentRiskEvent.where(correlation_key: "dispute:dp_ach_1").count
    rec = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_ach_1")
    assert_equal "post_success_return", rec.risk_kind
    assert rec.exposure_confirmed
    assert_equal 44_000, rec.confirmed_loss_cents
    assert_equal "funds_withdrawn", rec.lifecycle_state
    assert txn.reload.status_succeeded?
    assert PaymentRiskEvent.open_for_job?(job)
  end

  test "different disputes on same job create separate risk records" do
    job, payment, txn = build_funded_job(title: "two disp", charge_id: "ch_d1", pm_type: "card")
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_top_up, direction: :inbound,
      amount_cents: 1100, currency: "usd", status: :succeeded, stripe_charge_id: "ch_d2",
      stripe_payment_intent_id: "pi_d2", payment_method_type: "card",
      idempotency_key: "tf_s2c_d2_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    ctrl = Api::V1::StripeWebhooksController.new
    ctrl.send(
      :reconcile_charge_dispute,
      OpenStruct.new(id: "dp_1", charge: "ch_d1", payment_intent: txn.stripe_payment_intent_id, status: "needs_response", reason: "fraudulent", amount: 100),
      event_type: "charge.dispute.created"
    )
    ctrl.send(
      :reconcile_charge_dispute,
      OpenStruct.new(id: "dp_2", charge: "ch_d2", payment_intent: "pi_d2", status: "needs_response", reason: "fraudulent", amount: 100),
      event_type: "charge.dispute.created"
    )
    assert_equal 2, PaymentRiskEvent.where(job_id: job.id, risk_kind: "post_success_dispute").count
  end

  test "admin resolve clears transfer block without reversing transfers" do
    job, payment, _txn = build_funded_job(title: "admin res", charge_id: "ch_ar", pm_type: "us_bank_account")
    PaymentRiskEvent.record_confirmed_ach_return!(
      job: job,
      job_payment_transaction: job.job_payment_transactions.first,
      stripe_charge_id: "ch_ar",
      stripe_dispute_id: "dp_ar",
      amount_cents: 44_000
    )
    assert PaymentRiskEvent.open_for_job?(job)

    risk = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_ar")
    risk.resolve!(note: "Reviewed with Stripe evidence", actor: "admin@example.com")
    refute PaymentRiskEvent.open_for_job?(job.reload)
    assert_equal "admin_resolved", risk.reload.lifecycle_state
    assert_equal 0, job.job_payment_transactions.where(transaction_type: :transfer_reversal).count
    assert payment.present?
  end

  test "closed won dispute does not auto-unblock transfers" do
    job, _payment, txn = build_funded_job(title: "won block", charge_id: "ch_won", pm_type: "card")
    dispute = OpenStruct.new(
      id: "dp_won", charge: "ch_won", payment_intent: txn.stripe_payment_intent_id,
      status: "won", reason: "fraudulent", amount: 1000
    )
    ctrl = Api::V1::StripeWebhooksController.new
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.created")
    ctrl.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.closed")
    assert PaymentRiskEvent.open_for_job?(job)
  end

  # --- confirmed vs unconfirmed returns ---

  test "payment_failed after success stays unconfirmed not confirmed loss" do
    job, _payment, txn = build_funded_job(title: "unconf", charge_id: "ch_uc", pm_type: "us_bank_account")
    pi = OpenStruct.new(
      id: txn.stripe_payment_intent_id,
      status: "requires_payment_method",
      latest_charge: "ch_uc",
      payment_method: "pm_bank",
      last_payment_error: OpenStruct.new(message: "late signal", code: "payment_intent_payment_attempt_failed"),
      metadata: {}
    )
    JobStripeOps.stub(:payment_method_display, {}) do
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_failed, pi)
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_failed, pi)
    end
    assert txn.reload.status_succeeded?
    risks = PaymentRiskEvent.where(correlation_key: "unconfirmed_pi:#{txn.stripe_payment_intent_id}")
    assert_equal 1, risks.count
    refute risks.first.exposure_confirmed
    assert_nil risks.first.confirmed_loss_cents
    assert_equal "post_success_reversal_unconfirmed", risks.first.risk_kind
  end

  test "confirmed return after transfer marks transfer_already_executed" do
    job, payment, txn = build_funded_job(title: "ret after xfer", charge_id: "ch_rax", pm_type: "us_bank_account")
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 8_000, currency: "usd", status: :succeeded, source_charge_id: "ch_rax",
      idempotency_key: "tf_s2c_rax_#{job.id}", revision: 2, succeeded_at: Time.current
    )
    dispute = OpenStruct.new(
      id: "dp_rax", charge: "ch_rax", payment_intent: txn.stripe_payment_intent_id,
      status: "lost", reason: "debit_not_authorized", amount: 44_000
    )
    Api::V1::StripeWebhooksController.new.send(:reconcile_charge_dispute, dispute, event_type: "charge.dispute.created")
    rec = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_rax")
    assert rec.transfer_already_executed
    assert rec.exposure_confirmed
    assert_equal "unknown", rec.bank_payout_status
    assert_equal 0, job.job_payment_transactions.where(transaction_type: :transfer_reversal).count
  end

  # --- staging / production guards ---

  test "staging missing key fails closed" do
    old = Stripe.api_key
    Stripe.api_key = nil
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      msg = StripeModeGuard.error_message
      assert_match(/missing|sk_test/i, msg)
    end
  ensure
    Stripe.api_key = old
  end

  test "staging accepts sk_test" do
    old = Stripe.api_key
    Stripe.api_key = "sk_test_valid_for_guard"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      assert_nil StripeModeGuard.error_message
    end
  ensure
    Stripe.api_key = old
  end

  test "staging rejects sk_live" do
    old = Stripe.api_key
    Stripe.api_key = "sk_live_forbidden"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      assert_match(/test mode|forbidden/i, StripeModeGuard.error_message)
    end
  ensure
    Stripe.api_key = old
  end

  test "staging rejects DEMO_MODE env even when DemoMode disabled" do
    old_key = Stripe.api_key
    old_demo = ENV["DEMO_MODE"]
    Stripe.api_key = "sk_test_ok"
    ENV["DEMO_MODE"] = "true"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      assert_match(/DEMO_MODE/i, StripeModeGuard.error_message)
    end
  ensure
    Stripe.api_key = old_key
    ENV["DEMO_MODE"] = old_demo
  end

  test "production rejects sk_test and DEMO_MODE" do
    old_key = Stripe.api_key
    old_demo = ENV["DEMO_MODE"]
    Stripe.api_key = "sk_test_not_for_prod"
    ENV["DEMO_MODE"] = "true"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      msg = StripeModeGuard.error_message
      assert_match(/DEMO_MODE|live/i, msg)
    end
    ENV["DEMO_MODE"] = nil
    Stripe.api_key = "sk_test_still_bad"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      assert_match(/live|Test keys/i, StripeModeGuard.error_message)
    end
    Stripe.api_key = "sk_live_ok"
    Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
      assert_nil StripeModeGuard.error_message
    end
  ensure
    Stripe.api_key = old_key
    ENV["DEMO_MODE"] = old_demo
  end

  test "staging sandbox blocks real world without dual unsafe override" do
    old_a = ENV["STAGING_ALLOW_REAL_WORLD_COMMS"]
    old_u = ENV["STAGING_UNSAFE_ALLOW_REAL_WORLD_COMMS"]
    ENV["STAGING_ALLOW_REAL_WORLD_COMMS"] = "true"
    ENV["STAGING_UNSAFE_ALLOW_REAL_WORLD_COMMS"] = nil
    Rails.stub(:env, ActiveSupport::StringInquirer.new("staging")) do
      assert StagingSandbox.block_real_world_comms?
      assert StagingSandbox.simulate_sms?
      assert StagingSandbox.simulate_checkr?
      assert StagingSandbox.simulate_ghl?
    end
  ensure
    ENV["STAGING_ALLOW_REAL_WORLD_COMMS"] = old_a
    ENV["STAGING_UNSAFE_ALLOW_REAL_WORLD_COMMS"] = old_u
  end

  test "setup success not overwritten by later cancel" do
    si_ok = OpenStruct.new(
      id: "seti_patch", customer: "cus_s2c_test", payment_method: "pm_1",
      status: "succeeded", payment_method_types: ["us_bank_account"], last_setup_error: nil
    )
    Api::V1::StripeWebhooksController.new.send(:reconcile_setup_intent, si_ok, event_type: "setup_intent.succeeded")
    si_bad = OpenStruct.new(
      id: "seti_patch", customer: "cus_s2c_test", payment_method: nil,
      status: "canceled", payment_method_types: ["us_bank_account"], last_setup_error: OpenStruct.new(message: "x")
    )
    Api::V1::StripeWebhooksController.new.send(:reconcile_setup_intent, si_bad, event_type: "setup_intent.canceled")
    assert_equal "succeeded", StripeSetupRecord.find_by!(stripe_setup_intent_id: "seti_patch").status
  end
end
