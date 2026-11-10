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

  def attach_tech!(job, account_id: nil)
    tech = User.create!(email: "out-tech-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
    tp = TechnicianProfile.create!(
      user: tech, trade_type: "General", availability: "Full-time", membership_level: "basic",
      stripe_account_id: account_id || "acct_out_#{SecureRandom.hex(3)}",
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

  def not_found_lookup
    JobStripeOps::LookupResult.new(status: "not_found_after_complete_search")
  end

  def failed_lookup(error = "Net::ReadTimeout")
    JobStripeOps::LookupResult.new(status: "lookup_failed", error: error)
  end

  def found_lookup(transfer)
    JobStripeOps::LookupResult.new(status: "found", transfer: transfer)
  end

  def matching_transfer(txn:, tech:, id: "tr_match")
    OpenStruct.new(
      id: id,
      amount: txn.amount_cents,
      currency: txn.currency,
      destination: tech.stripe_account_id,
      transfer_group: txn.job.transfer_group,
      metadata: {
        "transaction_id" => txn.id.to_s,
        "job_id" => txn.job_id.to_s,
        "revision" => txn.revision.to_s
      }
    )
  end

  def unknown_txn!(job, payment, tech:, attempted_at: Time.current)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :outcome_unknown, revision: 1,
      idempotency_key: "tf_job_#{job.id}_txn_technician_transfer_r1",
      transfer_first_attempted_at: attempted_at,
      investigation_required: true,
      metadata_json: {
        "source_allocation" => {
          "charge_id" => "ch_out", "mode" => "single_charge", "reason" => "ok", "safe" => true
        }
      }
    )
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
    assert txn.transfer_first_attempted_at.present?
    reserved = PaymentService.reserved_transfer_cents(job)
    assert_equal 72_000, reserved

    captured = []
    stub_release(job, payment) do
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
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
    txn = unknown_txn!(job, payment, tech: tech)
    fake_tr = matching_transfer(txn: txn, tech: tech, id: "tr_found_1")
    creates = 0
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { found_lookup(fake_tr) }) do
      JobStripeOps.stub(:transfer!, ->(**_k) { creates += 1; raise "should not create" }) do
        result = PaymentService.reconcile_technician_transfer!(txn)
        assert result[:success], result.inspect
        assert result[:reconciled]
      end
    end
    assert_equal 0, creates
    assert txn.reload.status_succeeded?
    assert_equal "tr_found_1", txn.stripe_transfer_id
  end

  test "lookup Stripe error is lookup_failed — no create, still outcome_unknown" do
    job, payment = build_job(title: "lookup err")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech)
    creates = 0
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { failed_lookup("connection reset") }) do
      JobStripeOps.stub(:transfer!, ->(**_k) { creates += 1; raise "should not create" }) do
        result = PaymentService.reconcile_technician_transfer!(txn)
        assert result[:lookup_failed]
        refute result[:allow_retry]
        assert result[:error].present?

        release = nil
        stub_release(job, payment) do
          release = PaymentService.release_to_technician(payment)
        end
        refute release[:success]
        assert release[:lookup_failed] || release[:error].to_s.match?(/lookup failed/i)
      end
    end
    assert_equal 0, creates
    assert txn.reload.status_outcome_unknown?
  end

  test "incomplete pagination is lookup_failed" do
    list = OpenStruct.new(data: [], has_more: true)
    Stripe::Transfer.stub(:list, ->(*_a) { list }) do
      JobStripeOps.stub(:simulate_stripe?, false) do
        # api_key blank would short-circuit; force a non-blank key for this unit path
        previous = Stripe.api_key
        Stripe.api_key = "sk_test_lookup"
        begin
          result = JobStripeOps.find_transfer_for_transaction(
            destination: "acct_x",
            transfer_group: "TECHFLASH_JOB_1",
            transaction_id: 1,
            job_id: 1
          )
          assert result.lookup_failed?, result.inspect
          assert_match(/incomplete_pagination|pagination_cap/, result.error.to_s)
        ensure
          Stripe.api_key = previous
        end
      end
    end
  end

  test "complete not-found under 24h allows same-key retry with same allocation" do
    job, payment = build_job(title: "recon none young")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech, attempted_at: 1.hour.ago)
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
      result = PaymentService.reconcile_technician_transfer!(txn)
      assert_equal false, result[:found]
      assert result[:allow_retry]
    end

    captured = []
    stub_release(job, payment) do
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        JobStripeOps.stub(:transfer!, ->(**kwargs) {
          captured << kwargs
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_retry_ok")
        }) do
          result = PaymentService.release_to_technician(payment)
          assert result[:success], result.inspect
        end
      end
    end
    assert_equal 1, captured.size
    assert_equal "ch_out", captured.first[:source_transaction]
    assert_equal txn.idempotency_key, captured.first[:idempotency_key]
  end

  test "complete not-found at or after 23h blocks auto create and requires admin path" do
    job, payment = build_job(title: "recon none old")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech, attempted_at: 24.hours.ago)
    creates = 0
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
      result = PaymentService.reconcile_technician_transfer!(txn)
      refute result[:allow_retry]
      assert result[:requires_admin_authorization]

      stub_release(job, payment) do
        JobStripeOps.stub(:transfer!, ->(**_k) { creates += 1; raise "no create" }) do
          release = PaymentService.release_to_technician(payment)
          refute release[:success]
          assert release[:requires_admin_authorization] || release[:error].to_s.match?(/23h|admin/i)
        end
      end
    end
    assert_equal 0, creates
    assert txn.reload.status_outcome_unknown?
  end

  test "admin path with lookup_failed is refused" do
    job, payment = build_job(title: "admin lookup fail")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech, attempted_at: 24.hours.ago)
    admin = User.create!(email: "auth-admin-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :admin)
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { failed_lookup("timeout") }) do
      result = PaymentService.reconcile_technician_transfer!(
        txn, admin_authorize_retry: true, actor: admin,
        reason: "retry after timeout", acknowledged_prior_timeout_risk: true
      )
      assert result[:lookup_failed]
      refute result[:allow_retry]
      refute result[:admin_authorized]
    end
    assert_equal 0, TransferRetryAuthorization.where(job_payment_transaction_id: txn.id).count
  end

  test "admin authorize after complete not-found outside window allows same-key create" do
    job, payment = build_job(title: "admin authorize")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech, attempted_at: 24.hours.ago)
    admin = User.create!(email: "auth-ok-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :admin)
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
      auth = PaymentService.reconcile_technician_transfer!(
        txn, admin_authorize_retry: true, actor: admin,
        reason: "manual retry after timeout window", acknowledged_prior_timeout_risk: true
      )
      assert auth[:allow_retry], auth.inspect
      assert auth[:admin_authorized]
      assert TransferRetryAuthorization.active.where(job_payment_transaction_id: txn.id).exists?
      assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "granted").exists?
    end

    captured = []
    stub_release(job, payment) do
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        JobStripeOps.stub(:transfer!, ->(**kwargs) {
          captured << kwargs
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_admin_ok")
        }) do
          result = PaymentService.release_to_technician(payment)
          assert result[:success], result.inspect
        end
      end
    end
    assert_equal 1, captured.size
    assert_equal txn.idempotency_key, captured.first[:idempotency_key]
    assert TransferRetryAuthorization.where(job_payment_transaction_id: txn.id, status: "consumed").exists?
    assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "granted").exists?
    assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "consumed").exists?
  end

  test "admin authorization expires after 1 hour (frozen time)" do
    job, payment = build_job(title: "auth expiry")
    tech = attach_tech!(job)
    admin = User.create!(email: "exp-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :admin)
    travel_to Time.zone.parse("2026-11-10 12:00:00") do
      txn = unknown_txn!(job, payment, tech: tech, attempted_at: Time.zone.parse("2026-11-09 10:00:00")) # >23h before frozen now
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        grant = PaymentService.reconcile_technician_transfer!(
          txn, admin_authorize_retry: true, actor: admin,
          reason: "grant then expire", acknowledged_prior_timeout_risk: true
        )
        assert grant[:admin_authorized], grant.inspect
        assert TransferRetryAuthorization.active.where(job_payment_transaction_id: txn.id).exists?
      end
    end
    txn = job.job_payment_transactions.find_by!(transaction_type: :technician_transfer)
    assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "granted").exists?
    travel_to Time.zone.parse("2026-11-10 13:05:00") do
      refute TransferRetryAuthorization.active.where(job_payment_transaction_id: txn.id).exists?
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        consume = PaymentService.consume_admin_transfer_authorization!(
          txn, destination: tech.stripe_account_id, actor: admin
        )
        refute consume[:ok], consume.inspect
        assert consume[:requires_admin_authorization] || consume[:error].to_s.match?(/expired|No active/i)
      end
    end
  end

  test "found transfer with mismatched amount destination currency metadata is flagged not succeeded" do
    job, payment = build_job(title: "mismatch")
    tech = attach_tech!(job, account_id: "acct_dest_ok")
    txn = unknown_txn!(job, payment, tech: tech)
    bad = OpenStruct.new(
      id: "tr_bad",
      amount: 1,
      currency: "eur",
      destination: "acct_wrong",
      transfer_group: "OTHER_GROUP",
      metadata: { "transaction_id" => "999", "job_id" => "0", "revision" => "9" }
    )
    creates = 0
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { found_lookup(bad) }) do
      JobStripeOps.stub(:transfer!, ->(**_k) { creates += 1; raise "no create" }) do
        result = PaymentService.reconcile_technician_transfer!(txn)
        assert result[:mismatch]
        refute result[:success]
        refute result[:allow_retry]
      end
    end
    assert_equal 0, creates
    assert txn.reload.status_outcome_unknown?
    assert txn.investigation_required?
    assert txn.metadata_json.to_h["transfer_mismatch"]
    assert_nil txn.stripe_transfer_id
  end

  test "transfer webhook resolves outcome_unknown idempotently when fields match" do
    job, payment = build_job(title: "wh resolve")
    tech = attach_tech!(job)
    txn = unknown_txn!(job, payment, tech: tech)
    transfer = matching_transfer(txn: txn, tech: tech, id: "tr_wh_1")
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

  test "funds_reinstated does not auto-unblock technician transfers" do
    job, payment = build_job(title: "reinstated hold")
    attach_tech!(job)
    txn = job.job_payment_transactions.company_collections.first
    dispute = OpenStruct.new(
      id: "dp_reinst", charge: txn.stripe_charge_id, payment_intent: txn.stripe_payment_intent_id,
      status: "won", reason: "fraudulent", amount: 1000
    )
    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.funds_withdrawn", stripe_event_id: "evt_fw",
      stripe_event_created_at: 2.hours.ago
    )
    assert PaymentRiskEvent.open_for_job?(job)

    PaymentRiskEvent.upsert_dispute!(
      job: job, dispute: dispute, job_payment_transaction: txn,
      event_type: "charge.dispute.funds_reinstated", stripe_event_id: "evt_fr",
      stripe_event_created_at: Time.current
    )
    risk = PaymentRiskEvent.find_by!(correlation_key: "dispute:dp_reinst")
    assert_equal "funds_reinstated", risk.lifecycle_state
    assert_equal "reviewing", risk.investigation_status
    assert PaymentRiskEvent.open_for_job?(job), "funds_reinstated must keep blocking until admin resolve"

    stub_release(job, payment) do
      JobStripeOps.stub(:transfer!, ->(**_k) { raise "must not transfer while risk open" }) do
        result = PaymentService.release_to_technician(payment)
        refute result[:success]
        assert_match(/financial risk|blocked/i, result[:error].to_s)
      end
    end
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
    test "postgresql concurrent authorized retries yield exactly one create attempt" do
      job, payment = build_job(title: "auth concurrent")
      tech = attach_tech!(job)
      txn = unknown_txn!(job, payment, tech: tech, attempted_at: 24.hours.ago)
      admin = User.create!(email: "conc-auth-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :admin)
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        PaymentService.reconcile_technician_transfer!(
          txn, admin_authorize_retry: true, actor: admin,
          reason: "concurrent consume test", acknowledged_prior_timeout_risk: true
        )
      end
      creates_count = 0
      mutex = Mutex.new
      errors = []
      results = []
      ledger = OpenStruct.new(fully_funded: true, transferred_cents: 0, technician_net_payout_cents: 72_000, net_funded_cents: 110_000)
      # Stub once outside threads — concurrent unstub races can undefine class methods.
      JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) { not_found_lookup }) do
        JobStripeOps.stub(:transfer!, ->(**_k) {
          mutex.synchronize { creates_count += 1 }
          sleep 0.05
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_conc_#{SecureRandom.hex(3)}")
        }) do
          StripeConnectAccountService.stub(:payout_ready?, true) do
            JobLedger.stub(:for, ledger) do
              JobLedger.stub(:new, OpenStruct.new(technician_commission_percent!: 20)) do
                threads = 2.times.map do
                  Thread.new do
                    ActiveRecord::Base.connection_pool.with_connection do
                      results << PaymentService.release_to_technician(payment)
                    end
                  rescue StandardError => e
                    errors << e
                  end
                end
                threads.each(&:join)
              end
            end
          end
        end
      end
      assert_empty errors.map(&:message)
      assert_equal 1, creates_count, "expected exactly one Stripe create, got #{creates_count}; results=#{results.inspect}"
      assert_equal 1, TransferRetryAuthorization.where(job_payment_transaction_id: txn.id, status: "consumed").count
      assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "granted").exists?
      assert TransferRetryAuthorizationAudit.where(job_payment_transaction_id: txn.id, event: "consumed").exists?
    end

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
