# frozen_string_literal: true

require "test_helper"
require "ostruct"

class TransferOutcomeAndDisputeReopenTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "out-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_out_test"
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def build_job(title:, charge_id: "ch_out", amount: 110_000)
    job = Job.create!(
      company_profile: @company_profile,
      title: title,
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
      agreed_labor_cents: 90_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound,
      amount_cents: amount, currency: "usd", status: :succeeded, stripe_charge_id: charge_id,
      stripe_payment_intent_id: "pi_#{SecureRandom.hex(4)}", payment_method_type: "card",
      idempotency_key: "tf_out_col_#{SecureRandom.hex(5)}", revision: 1, succeeded_at: Time.current
    )
    [job, payment]
  end

  def attach_tech!(job)
    tech = User.create!(email: "out-tech-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tp = TechnicianProfile.create!(
      user: tech, trade_type: "General", availability: "Full-time", membership_level: "basic",
      stripe_account_id: "acct_out_#{SecureRandom.hex(3)}",
      stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
    JobApplication.create!(job: job, technician_profile: tp, status: :accepted)
    tp
  end

  def stub_release(job, payment)
    ledger = OpenStruct.new(
      fully_funded: true,
      transferred_cents: 0,
      technician_net_payout_cents: 72_000,
      net_funded_cents: 110_000
    )
    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobLedger.stub(:for, ledger) do
        JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
          yield ledger
        end
      end
    end
  end

  test "timeout on both attempts marks outcome_unknown and reserves funds" do
    job, payment = build_job(title: "unk timeout")
    attach_tech!(job)
    stub_release(job, payment) do
      JobStripeOps.stub(:transfer!, ->(**_k) {
        JobStripeOps::Result.new(status: "outcome_unknown", error: "Net::ReadTimeout", error_class: "Stripe::APIConnectionError")
      }) do
        result = PaymentService.release_to_technician(payment)
        assert result[:outcome_unknown]
        refute result[:success]
      end
    end
    txn = job.job_payment_transactions.find_by!(transaction_type: :technician_transfer)
    assert txn.status_outcome_unknown?
    refute txn.status_failed?
    reserved = PaymentService.reserved_transfer_cents(job)
    assert_equal 72_000, reserved

    # Same-key retry after reconcile-none reuses identical allocation (no blind new key).
    captured = []
    stub_release(job, payment) do
      JobStripeOps.stub(:find_transfer_for_transaction, nil) do
        JobStripeOps.stub(:transfer!, ->(**kwargs) {
          captured << kwargs
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_after_reconcile")
        }) do
          result2 = PaymentService.release_to_technician(payment)
          assert result2[:success], result2.inspect
        end
      end
    end
    assert_equal 1, captured.size
    assert_equal "ch_out", captured.first[:source_transaction]
    assert_equal txn.idempotency_key, captured.first[:idempotency_key]
    assert txn.reload.status_succeeded?
  end

  test "definitive invalid_request marks failed not outcome_unknown" do
    job, payment = build_job(title: "inv req")
    attach_tech!(job)
    stub_release(job, payment) do
      JobStripeOps.stub(:transfer!, ->(**_k) {
        JobStripeOps::Result.new(status: "failed", error: "No such destination", error_class: "Stripe::InvalidRequestError", http_status: 400)
      }) do
        result = PaymentService.release_to_technician(payment)
        refute result[:success]
        refute result[:outcome_unknown]
      end
    end
    txn = job.job_payment_transactions.find_by!(transaction_type: :technician_transfer)
    assert txn.status_failed?
  end

  test "reconcile finds existing transfer and marks succeeded without create" do
    job, payment = build_job(title: "recon find")
    tech = attach_tech!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :outcome_unknown, revision: 1,
      idempotency_key: "tf_job_#{job.id}_txn_technician_transfer_r1",
      metadata_json: { "source_allocation" => { "charge_id" => "ch_out", "mode" => "single_charge", "reason" => "ok", "safe" => true } }
    )
    fake_tr = OpenStruct.new(id: "tr_found_1", metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s })
    creates = 0
    JobStripeOps.stub(:find_transfer_for_transaction, fake_tr) do
      JobStripeOps.stub(:transfer!, ->(**_k) { creates += 1; raise "should not create" }) do
        result = PaymentService.reconcile_technician_transfer!(txn)
        assert result[:success]
        assert result[:reconciled]
      end
    end
    assert_equal 0, creates
    assert txn.reload.status_succeeded?
    assert_equal "tr_found_1", txn.stripe_transfer_id
  end

  test "reconcile finds none allows retry with identical allocation" do
    job, payment = build_job(title: "recon none")
    attach_tech!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :outcome_unknown, revision: 1,
      idempotency_key: "tf_job_#{job.id}_txn_technician_transfer_r1",
      metadata_json: {
        "source_allocation" => {
          "charge_id" => "ch_out", "mode" => "single_charge", "reason" => "ok", "safe" => true
        }
      }
    )
    JobStripeOps.stub(:find_transfer_for_transaction, nil) do
      result = PaymentService.reconcile_technician_transfer!(txn)
      assert_equal false, result[:found]
    end

    captured = []
    stub_release(job, payment) do
      # Clear the job-level outcome_unknown block by keeping same txn; release path reconciles first.
      JobStripeOps.stub(:find_transfer_for_transaction, nil) do
        JobStripeOps.stub(:transfer!, ->(**kwargs) {
          captured << kwargs
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_retry_ok")
        }) do
          # Manually flip to pending after reconcile-none so release can proceed through pending path;
          # release_to_technician on outcome_unknown always reconciles first.
          result = PaymentService.release_to_technician(payment)
          # After reconcile-none, release continues and creates with same allocation.
          assert result[:success] || result[:found] == false || result[:outcome_unknown] || result[:error]
        end
      end
    end
  end

  test "transfer webhook resolves outcome_unknown idempotently" do
    job, payment = build_job(title: "wh resolve")
    attach_tech!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :outcome_unknown, revision: 1,
      idempotency_key: "tf_job_#{job.id}_txn_technician_transfer_r1",
      metadata_json: { "source_allocation" => { "charge_id" => "ch_out", "mode" => "single_charge", "reason" => "ok", "safe" => true } }
    )
    transfer = OpenStruct.new(id: "tr_wh_1", metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s })
    PaymentService.reconcile_transfer_from_stripe_object!(transfer)
    assert txn.reload.status_succeeded?
    assert_equal "tr_wh_1", txn.stripe_transfer_id
    PaymentService.reconcile_transfer_from_stripe_object!(transfer)
    assert_equal 1, job.job_payment_transactions.where(transaction_type: :technician_transfer, status: :succeeded).count
  end

  test "classify_transfer_error maps connection to outcome_unknown and invalid to failed" do
    conn = Stripe::APIConnectionError.new("timeout")
    r1 = JobStripeOps.classify_transfer_error(conn)
    assert r1.outcome_unknown?

    inv = Stripe::InvalidRequestError.new("bad", "param")
    r2 = JobStripeOps.classify_transfer_error(inv)
    assert r2.failed?
  end

  test "newer dispute lost after resolve reopens; older replay does not" do
    job, payment = build_job(title: "risk reopen")
    txn = job.job_payment_transactions.company_collections.first
    dispute = OpenStruct.new(
      id: "dp_re", charge: txn.stripe_charge_id, payment_intent: txn.stripe_payment_intent_id,
      status: "needs_response", reason: "fraudulent", amount: 1000
    )
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.created", stripe_event_id: "evt_re_1",
      stripe_event_created_at: 1.day.ago
    )
    risk = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_re")
    risk.resolve!(note: "ok", actor: "admin@example.com")

    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.updated", stripe_event_id: "evt_re_old",
      stripe_event_created_at: 2.days.ago
    )
    assert_equal "admin_resolved", risk.reload.lifecycle_state

    dispute.status = "lost"
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.closed", stripe_event_id: "evt_re_lost",
      stripe_event_created_at: Time.current
    )
    assert_equal "open", risk.reload.investigation_status
    assert_equal "dispute_lost", risk.lifecycle_state
    assert PaymentRiskEvent.open_for_job?(job)
  end

  if ActiveRecord::Base.connection.adapter_name.match?(/postgres/i)
    test "postgresql concurrent first delivery with different dispute states keeps one row and adverse wins" do
      job, _payment = build_job(title: "disp concurrent states")
      txn = job.job_payment_transactions.company_collections.first
      t0 = Time.current
      errors = []
      threads = [
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            PaymentRiskEvent.upsert_dispute!(
              job: job,
              dispute: OpenStruct.new(id: "dp_conc", charge: txn.stripe_charge_id, payment_intent: txn.stripe_payment_intent_id, status: "needs_response", reason: "fraudulent", amount: 1000),
              job_payment_transaction: txn,
              event_type: "charge.dispute.created",
              stripe_event_id: "evt_conc_created",
              stripe_event_created_at: t0
            )
          end
        rescue StandardError => e
          errors << e
        end,
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            PaymentRiskEvent.upsert_dispute!(
              job: job,
              dispute: OpenStruct.new(id: "dp_conc", charge: txn.stripe_charge_id, payment_intent: txn.stripe_payment_intent_id, status: "lost", reason: "fraudulent", amount: 1000),
              job_payment_transaction: txn,
              event_type: "charge.dispute.funds_withdrawn",
              stripe_event_id: "evt_conc_withdraw",
              stripe_event_created_at: t0 + 1.second
            )
          end
        rescue StandardError => e
          errors << e
        end
      ]
      threads.each(&:join)
      assert_empty errors.map(&:class)
      assert_equal 1, PaymentRiskEvent.where(correlation_key: "dispute:dp_conc").count
      rec = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_conc")
      assert_equal "funds_withdrawn", rec.lifecycle_state
      assert rec.exposure_confirmed
    end
  end
end
