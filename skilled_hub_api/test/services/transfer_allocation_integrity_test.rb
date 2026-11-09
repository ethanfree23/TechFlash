# frozen_string_literal: true

require "test_helper"
require "ostruct"

class TransferAllocationIntegrityTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "alloc-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_alloc_test"
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def build_job(title:, charge_id: "ch_alloc", amount: 100_000, pm_type: "card")
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
    col = JobPaymentTransaction.create!(
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
      idempotency_key: "tf_alloc_col_#{SecureRandom.hex(6)}",
      revision: 1,
      succeeded_at: Time.current
    )
    [job, payment, col]
  end

  def attach_ready_technician!(job)
    tech = User.create!(
      email: "alloc-tech-#{SecureRandom.hex(3)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician
    )
    tp = TechnicianProfile.create!(
      user: tech,
      trade_type: "General",
      availability: "Full-time",
      membership_level: "basic",
      stripe_account_id: "acct_alloc_#{SecureRandom.hex(3)}",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
    JobApplication.create!(job: job, technician_profile: tp, status: :accepted)
    tp
  end

  test "current pending transfer is excluded so source Charge is selected" do
    job, payment, _col = build_job(title: "self alloc", charge_id: "ch_self", amount: 100_000)
    pending = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 80_000, currency: "usd", status: :pending,
      idempotency_key: "tf_alloc_pending_#{job.id}", revision: 1
    )

    without_exclude = PaymentService.source_transaction_decision(job, amount_cents: 80_000)
    assert_equal "blocked", without_exclude[:mode]
    assert_equal "insufficient_allocatable_source", without_exclude[:reason]

    decision = PaymentService.source_transaction_decision(
      job, amount_cents: 80_000, exclude_transfer_id: pending.id
    )
    assert decision[:safe]
    assert_equal "single_charge", decision[:mode]
    assert_equal "ch_self", decision[:charge_id]
    assert_operator decision[:allocatable_cents], :>=, 80_000
  end

  test "prior transfer remains reserved when excluding current pending" do
    job, payment, _col = build_job(title: "prior reserved", charge_id: "ch_prior", amount: 100_000)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 70_000, currency: "usd", status: :succeeded, source_charge_id: "ch_prior",
      idempotency_key: "tf_alloc_prior_#{job.id}", revision: 1, succeeded_at: Time.current
    )
    pending = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 40_000, currency: "usd", status: :pending,
      idempotency_key: "tf_alloc_cur_#{job.id}", revision: 2
    )

    decision = PaymentService.source_transaction_decision(
      job.reload, amount_cents: 40_000, exclude_transfer_id: pending.id
    )
    assert_equal "blocked", decision[:mode]
    assert_equal "insufficient_allocatable_source", decision[:reason]
    assert_equal 30_000, decision[:allocatable_cents]
  end

  test "persist_source_allocation stabilizes idempotency parameters across retries" do
    job, payment, _col = build_job(title: "persist alloc", charge_id: "ch_persist", amount: 100_000)
    pending = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 80_000, currency: "usd", status: :pending,
      idempotency_key: "tf_alloc_persist_#{job.id}", revision: 1
    )

    first = PaymentService.persist_source_allocation!(pending, job: job, amount_cents: 80_000)
    assert_equal "ch_persist", first[:charge_id]
    # Corrupt live ledger after decision — cached allocation must still win.
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :final_hours_refund, direction: :outbound,
      amount_cents: 90_000, currency: "usd", status: :pending,
      idempotency_key: "tf_alloc_late_ref_#{job.id}", revision: 2
    )
    second = PaymentService.persist_source_allocation!(pending.reload, job: job.reload, amount_cents: 80_000)
    assert_equal first[:charge_id], second[:charge_id]
    assert_equal first[:mode], second[:mode]
    assert_equal first[:reason], second[:reason]
  end

  test "release_to_technician uses source Charge when pending self-transfer would otherwise starve allocation" do
    job, payment, _col = build_job(title: "release self", charge_id: "ch_rel", amount: 110_000)
    tech = attach_ready_technician!(job)
    # Force technician_net via ledger: commission 20% of 90_000 labor = 72_000 payout typically
    # Use stubbed ledger path via JobStripeOps to avoid depending on exact money math —
    # create pending transfer that would self-starve without exclude.
    key = "tf_job_#{job.id}_txn_technician_transfer_r#{job.financial_revision}"
    pending = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :pending, revision: 1,
      idempotency_key: key
    )

    captured = {}
    fake = JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_self_ok")
    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobStripeOps.stub(:transfer!, ->(**kwargs) {
        captured.replace(kwargs)
        fake
      }) do
        # Bypass complex eligibility by calling persist + transfer path pieces through release
        # after stubbing JobLedger summary values via a thin wrapper:
        ledger = OpenStruct.new(
          fully_funded: true,
          transferred_cents: 0,
          technician_net_payout_cents: 72_000,
          net_funded_cents: 110_000
        )
        JobLedger.stub(:for, ledger) do
          JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
            result = PaymentService.release_to_technician(payment)
            assert result[:success], result.inspect
          end
        end
      end
    end

    assert_equal "ch_rel", captured[:source_transaction]
    assert_equal key, captured[:idempotency_key]
    assert_equal "ch_rel", pending.reload.source_charge_id
    assert_equal tech.stripe_account_id, captured[:destination]
  end

  test "unsafe allocation blocks release instead of platform balance" do
    job, payment, col = build_job(title: "block release", charge_id: "ch_block", amount: 10_000)
    attach_ready_technician!(job)
    col.update_columns(currency: "eur")

    ledger = OpenStruct.new(
      fully_funded: true,
      transferred_cents: 0,
      technician_net_payout_cents: 5_000,
      net_funded_cents: 10_000
    )
    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobLedger.stub(:for, ledger) do
        JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
          result = PaymentService.release_to_technician(payment)
          assert_match(/blocked|currency/i, result[:error].to_s)
          refute result[:success]
        end
      end
    end
  end

  test "stripe timeout retry uses identical idempotency parameters" do
    job, payment, _col = build_job(title: "timeout retry", charge_id: "ch_to", amount: 110_000)
    attach_ready_technician!(job)
    calls = []
    ledger = OpenStruct.new(
      fully_funded: true,
      transferred_cents: 0,
      technician_net_payout_cents: 72_000,
      net_funded_cents: 110_000
    )
    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobLedger.stub(:for, ledger) do
        JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
          JobStripeOps.stub(:transfer!, ->(**kwargs) {
            calls << kwargs
            if calls.size == 1
              JobStripeOps::Result.new(status: "failed", error: "Net::ReadTimeout timed out")
            else
              JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_recovered")
            end
          }) do
            result = PaymentService.release_to_technician(payment)
            assert result[:success], result.inspect
          end
        end
      end
    end

    assert_equal 2, calls.size
    assert_equal calls[0][:idempotency_key], calls[1][:idempotency_key]
    assert_equal calls[0][:source_transaction], calls[1][:source_transaction]
    assert_equal calls[0][:amount_cents], calls[1][:amount_cents]
    assert_equal "ch_to", calls[0][:source_transaction]
    assert_equal 1, job.job_payment_transactions.where(transaction_type: :technician_transfer, status: :succeeded).count
  end

  test "duplicate release after success returns existing transfer without second Stripe call" do
    job, payment, _col = build_job(title: "dup release", charge_id: "ch_dup", amount: 110_000)
    attach_ready_technician!(job)
    ledger = OpenStruct.new(
      fully_funded: true,
      transferred_cents: 0,
      technician_net_payout_cents: 72_000,
      net_funded_cents: 110_000
    )
    calls = 0
    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobLedger.stub(:for, ledger) do
        JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
          JobStripeOps.stub(:transfer!, ->(**_kwargs) {
            calls += 1
            JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_once")
          }) do
            first = PaymentService.release_to_technician(payment)
            assert first[:success]
            # Second call sees succeeded ledger (transferred_cents positive) — update stub
            ledger.transferred_cents = 72_000
            second = PaymentService.release_to_technician(payment)
            assert second[:success]
          end
        end
      end
    end
    assert_equal 1, calls
  end

  test "out-of-order dispute updated after funds_reinstated does not regress lifecycle" do
    job, _payment, txn = build_job(title: "disp order", charge_id: "ch_ord", pm_type: "card")
    dispute = OpenStruct.new(
      id: "dp_ord", charge: "ch_ord", payment_intent: txn.stripe_payment_intent_id,
      status: "won", reason: "fraudulent", amount: 1000
    )
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.funds_reinstated", ach_confirmed_return: false
    )
    rec = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_ord")
    assert_equal "funds_reinstated", rec.lifecycle_state

    dispute.status = "needs_response"
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.updated", ach_confirmed_return: false
    )
    assert_equal "funds_reinstated", rec.reload.lifecycle_state
    assert PaymentRiskEvent.open_for_job?(job)
  end

  test "admin resolved dispute is not reopened by later webhook" do
    job, _payment, txn = build_job(title: "admin hold", charge_id: "ch_ah", pm_type: "card")
    dispute = OpenStruct.new(
      id: "dp_ah", charge: "ch_ah", payment_intent: txn.stripe_payment_intent_id,
      status: "needs_response", reason: "fraudulent", amount: 1000
    )
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.created"
    )
    risk = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_ah")
    risk.resolve!(note: "cleared by admin", actor: "admin@example.com")
    refute PaymentRiskEvent.open_for_job?(job)

    dispute.status = "lost"
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.closed"
    )
    risk.reload
    assert_equal "resolved", risk.investigation_status
    assert_equal "admin_resolved", risk.lifecycle_state
    refute PaymentRiskEvent.open_for_job?(job)
  end

  test "duplicate dispute webhook keeps single risk row" do
    job, _payment, txn = build_job(title: "disp dup", charge_id: "ch_dd", pm_type: "us_bank_account")
    dispute = OpenStruct.new(
      id: "dp_dd", charge: "ch_dd", payment_intent: txn.stripe_payment_intent_id,
      status: "lost", reason: "debit_not_authorized", amount: 100_000
    )
    3.times do
      PaymentRiskEvent.upsert_dispute!(
        job: job, dispute: dispute, job_payment_transaction: txn,
        event_type: "charge.dispute.created", ach_confirmed_return: true
      )
    end
    assert_equal 1, PaymentRiskEvent.where(correlation_key: "dispute:dp_dd").count
    rec = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_dd")
    assert_equal "post_success_return", rec.risk_kind
    assert rec.exposure_confirmed
  end

  if ActiveRecord::Base.connection.adapter_name.match?(/postgres/i)
    test "postgresql concurrent first dispute delivery yields one row" do
      job, _payment, txn = build_job(title: "disp race", charge_id: "ch_race", pm_type: "card")
      dispute = OpenStruct.new(
        id: "dp_race", charge: "ch_race", payment_intent: txn.stripe_payment_intent_id,
        status: "needs_response", reason: "fraudulent", amount: 1000
      )
      errors = []
      threads = 2.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            PaymentRiskEvent.upsert_dispute!(
              job: job, dispute: dispute, job_payment_transaction: txn,
              event_type: "charge.dispute.created"
            )
          end
        rescue StandardError => e
          errors << e
        end
      end
      threads.each(&:join)
      assert_empty errors.map(&:message)
      assert_equal 1, PaymentRiskEvent.where(correlation_key: "dispute:dp_race").count
    end

    test "postgresql concurrent release attempts create one succeeded transfer" do
      job, payment, _col = build_job(title: "rel race", charge_id: "ch_rr", amount: 110_000)
      attach_ready_technician!(job)
      ledger = OpenStruct.new(
        fully_funded: true,
        transferred_cents: 0,
        technician_net_payout_cents: 72_000,
        net_funded_cents: 110_000
      )
      calls = Queue.new
      StripeConnectAccountService.stub(:payout_ready?, true) do
        JobLedger.stub(:for, ledger) do
          JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
            JobStripeOps.stub(:transfer!, ->(**kwargs) {
              calls << kwargs[:idempotency_key]
              sleep 0.05
              JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_race_#{kwargs[:idempotency_key]}")
            }) do
              threads = 2.times.map do
                Thread.new do
                  ActiveRecord::Base.connection_pool.with_connection do
                    PaymentService.release_to_technician(payment)
                  end
                end
              end
              results = threads.map(&:value)
              assert results.all? { |r| r[:success] }
            end
          end
        end
      end
      keys = []
      keys << calls.pop until calls.empty?
      assert_equal 1, keys.uniq.size
      assert_equal 1, job.job_payment_transactions.where(transaction_type: :technician_transfer, status: :succeeded).count
    end
  end
end
