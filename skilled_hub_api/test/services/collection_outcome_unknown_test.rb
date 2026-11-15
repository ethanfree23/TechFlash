# frozen_string_literal: true

require "test_helper"
require "ostruct"

# Company collection with an ambiguous Stripe result: persistence, idempotency, reconciliation.
class CollectionOutcomeUnknownTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "unk-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company
    )
    @company_user.update_column(:stripe_customer_id, "cus_unknown_1")
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
    @company_user.update_column(:company_profile_id, @company_profile.id)
    @admin = User.create!(email: "unk-admin-#{SecureRandom.hex(3)}@example.com", password: "password123",
                          password_confirmation: "password123", role: :admin)
  end

  def build_job
    Job.create!(
      company_profile: @company_profile, title: "Unknown job", description: "desc", status: :pending_funding,
      pay_basis: :guaranteed_job_pay, hourly_rate_cents: 7_500, hours_per_day: 8, days: 10,
      scheduled_start_at: 1.day.from_now, scheduled_end_at: 12.days.from_now, go_live_at: 3.days.ago
    )
  end

  def unknown_result
    JobStripeOps::Result.new(status: "outcome_unknown", error: "Timed out reading data from server",
                             error_class: "Stripe::APIConnectionError", payment_method_id: "pm_bank_1",
                             payment_method_type: "us_bank_account", payment_method_last4: "6789", payment_method_bank_name: "Chase")
  end

  def charge_cents(job)
    JobMoney.company_charge_cents(job.reload.agreed_labor_cents, job.company_commission_percent_snapshot)
  end

  def collect(job)
    JobFundingService.collect!(job: job, amount_cents: charge_cents(job), transaction_type: :initial_job_charge, revision: job.financial_revision)
  end

  def fund_unknown(job)
    JobStripeOps.stub(:create_payment_intent!, unknown_result) { JobFundingService.fund_for_publish!(job) }
  end

  def intent_for(txn, status:, id: "pi_recovered_1", overrides: {})
    OpenStruct.new({
      id: id, status: status, amount: txn.amount_cents, currency: "usd", customer: "cus_unknown_1",
      latest_charge: nil, client_secret: nil, last_payment_error: nil, payment_method: "pm_bank_1",
      metadata: { "transaction_id" => txn.id.to_s, "job_id" => txn.job_id.to_s, "payment_id" => txn.payment_id.to_s }
    }.merge(overrides))
  end

  def lookup(status, pi = nil, error: nil)
    JobStripeOps::PaymentIntentLookupResult.new(status: status, payment_intent: pi, error: error)
  end

  test "timeout before response persists outcome_unknown durably and never funds or fails the job" do
    job = build_job
    result = fund_unknown(job)

    assert result[:outcome_unknown]
    refute result[:success]
    assert_equal "payment_outcome_unknown", result[:code]
    job.reload
    assert job.pending_funding?
    assert job.funding_adjustment_required?, "unknown must not be funding_failed (a retry would create a second debit)"
    refute job.funding_funded?

    txn = job.job_payment_transactions.initial_job_charge.last
    assert txn.status_outcome_unknown?
    assert txn.investigation_required
    assert txn.collection_first_attempted_at.present?, "attempt stamped before the Stripe call"
    assert_nil txn.stripe_payment_intent_id
    assert_equal "tf_job_#{job.id}_txn_initial_job_charge_r1_#{txn.amount_cents}", txn.idempotency_key
    assert_equal 0, JobLedger.for(job).collected_cents
    refute JobLedger.for(job).fully_funded
    assert PaymentRiskEvent.exists?(correlation_key: "collection_unknown:#{txn.id}", investigation_status: "open")
  end

  test "attempt is stamped before Stripe is called so a crash leaves evidence" do
    job = build_job
    stamped = nil
    raiser = lambda do |**_kw|
      stamped = JobPaymentTransaction.where(job_id: job.id).pick(:collection_first_attempted_at)
      raise "process died"
    end
    JobStripeOps.stub(:create_payment_intent!, raiser) do
      assert_raises(RuntimeError) { JobFundingService.fund_for_publish!(job) }
    end
    assert stamped.present?
    txn = job.job_payment_transactions.initial_job_charge.last
    assert txn.status_pending?
    assert JobFundingService.unresolved_attempt?(txn)
  end

  test "unknown blocks a duplicate create: no new transaction, no new key, no Stripe create while lookup fails" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last

    calls = 0
    counter = ->(**_kw) { calls += 1; unknown_result }
    JobStripeOps.stub(:create_payment_intent!, counter) do
      JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("lookup_failed", error: "timeout")) do
        second = collect(job)
        assert second[:outcome_unknown]
        assert_equal txn.id, second[:transaction].id
      end
    end
    assert_equal 0, calls, "a second debit must never be attempted while the first is unknown"
    assert_equal 1, job.job_payment_transactions.initial_job_charge.count
    assert_equal 1, JobPaymentTransaction.where(job_id: job.id).distinct.count(:idempotency_key)
  end

  test "same-key retry is allowed only after a complete not-found search inside the safe window" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last
    original_key = txn.idempotency_key

    seen_keys = []
    success = JobStripeOps::Result.new(status: "processing", stripe_id: "pi_retry_ok", payment_method_id: "pm_bank_1", payment_method_type: "us_bank_account")
    recorder = ->(**kw) { seen_keys << kw[:idempotency_key]; success }
    JobStripeOps.stub(:create_payment_intent!, recorder) do
      JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("not_found_after_complete_search")) do
        result = collect(job)
        assert result[:processing]
      end
    end
    assert_equal [original_key], seen_keys, "retry must reuse the original idempotency key"
    assert txn.reload.status_processing?
    assert_equal 1, job.job_payment_transactions.initial_job_charge.count
  end

  test "expired safe window with complete not-found requires admin review and blocks retry" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last
    txn.update_column(:collection_first_attempted_at, 25.hours.ago)

    calls = 0
    JobStripeOps.stub(:create_payment_intent!, ->(**_kw) { calls += 1; unknown_result }) do
      JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("not_found_after_complete_search")) do
        result = collect(job)
        assert result[:outcome_unknown]
        assert_equal "requires_admin", result[:reconciliation_state]
      end
    end
    assert_equal 0, calls
    txn.reload
    assert txn.status_outcome_unknown?
    assert_equal true, txn.metadata_json["requires_admin_review"]
    assert_equal "requires_admin", CollectionOutcomeReconciler.reconciliation_state(txn)
  end

  test "partial / failed reconciliation lookup is never treated as proof that no PaymentIntent exists" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last
    txn.update_column(:collection_first_attempted_at, 25.hours.ago)

    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("lookup_failed", error: "pagination_cap_hit")) do
      decision = CollectionOutcomeReconciler.reconcile!(txn)
      assert decision.lookup_failed?
    end
    txn.reload
    assert txn.status_outcome_unknown?
    assert_equal true, txn.metadata_json["reconcile_lookup_failed"]
    refute txn.metadata_json["requires_admin_review"], "lookup failure is not the same as a complete not-found"

    # Admin cannot close as failed on top of a failed lookup either.
    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("lookup_failed", error: "timeout")) do
      decision = CollectionOutcomeReconciler.reconcile!(txn, admin_mark_failed: true, actor: @admin, reason: "closing")
      assert decision.lookup_failed?
      assert txn.reload.status_outcome_unknown?
    end
  end

  test "reconciler recovers a PaymentIntent that Stripe created although the request timed out" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last

    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("found", intent_for(txn, status: "processing"))) do
      decision = CollectionOutcomeReconciler.reconcile!(txn)
      assert decision.resolved_processing?
    end
    txn.reload
    assert txn.status_processing?
    assert_equal "pi_recovered_1", txn.stripe_payment_intent_id
    refute txn.investigation_required
    assert job.reload.pending_funding?
    refute job.funding_funded?
    assert_equal "resolved", PaymentRiskEvent.find_by(correlation_key: "collection_unknown:#{txn.id}").investigation_status

    # Later success via retrieve-by-id funds and publishes exactly once.
    JobStripeOps.stub(:retrieve_payment_intent, lookup("found", intent_for(txn, status: "succeeded"))) do
      JobAlertDispatcher.stub(:dispatch_for_job, true) do
        assert CollectionOutcomeReconciler.reconcile!(txn).resolved_succeeded?
        assert CollectionOutcomeReconciler.reconcile!(txn).resolved_succeeded?
      end
    end
    assert txn.reload.status_succeeded?
    assert job.reload.open?
    assert job.funding_funded?
    assert JobLedger.for(job).fully_funded
  end

  test "recovered PaymentIntent with mismatched amount or customer is flagged and never applied" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last

    bad = intent_for(txn, status: "succeeded", overrides: { amount: txn.amount_cents + 1 })
    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("found", bad)) do
      decision = CollectionOutcomeReconciler.reconcile!(txn)
      assert decision.mismatch?
      assert_includes decision.mismatches, "amount"
    end
    txn.reload
    assert txn.status_outcome_unknown?
    assert_equal true, txn.metadata_json["pi_mismatch"]
    refute job.reload.funding_funded?

    other_customer = intent_for(txn, status: "succeeded", overrides: { customer: "cus_someone_else" })
    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("found", other_customer)) do
      assert CollectionOutcomeReconciler.reconcile!(txn).mismatch?
    end
    assert txn.reload.status_outcome_unknown?
  end

  test "definitive Stripe failure recovered by reconciler marks failed and funding_failed" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last
    failed_pi = intent_for(txn, status: "requires_payment_method",
                           overrides: { last_payment_error: OpenStruct.new(message: "Debit not authorized") })
    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("found", failed_pi)) do
      assert CollectionOutcomeReconciler.reconcile!(txn).resolved_failed?
    end
    txn.reload
    assert txn.status_failed?
    assert_equal "Debit not authorized", txn.error_message
    assert job.reload.funding_funding_failed?
  end

  test "admin may close as failed only outside the window after a complete not-found, with a reason" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last

    JobStripeOps.stub(:find_payment_intent_for_attempt, lookup("not_found_after_complete_search")) do
      # Inside the window: admin close is not honoured (same-key retry still safe).
      decision = CollectionOutcomeReconciler.reconcile!(txn, admin_mark_failed: true, actor: @admin, reason: "x")
      assert decision.retry_same_key_allowed?
      assert txn.reload.status_outcome_unknown?

      txn.update_column(:collection_first_attempted_at, 25.hours.ago)
      assert_raises(ArgumentError) { CollectionOutcomeReconciler.reconcile!(txn, admin_mark_failed: true, actor: @admin, reason: " ") }

      decision = CollectionOutcomeReconciler.reconcile!(txn, admin_mark_failed: true, actor: @admin, reason: "Stripe dashboard confirmed no PI")
      assert decision.resolved_failed?
    end
    txn.reload
    assert txn.status_failed?
    assert_equal @admin.id, txn.metadata_json.dig("admin_closed_as_failed", "actor_user_id")
    assert job.reload.funding_funding_failed?
  end

  test "late success is never downgraded by reconciliation" do
    job = build_job
    fund_unknown(job)
    txn = job.job_payment_transactions.initial_job_charge.last
    txn.update!(status: :succeeded, succeeded_at: Time.current, stripe_payment_intent_id: "pi_done")

    JobStripeOps.stub(:retrieve_payment_intent, lookup("found", intent_for(txn, status: "processing", id: "pi_done"))) do
      assert CollectionOutcomeReconciler.reconcile!(txn).resolved_succeeded?
    end
    assert txn.reload.status_succeeded?
  end

  test "API failure arriving after a webhook already moved the row to processing does not downgrade it" do
    job = build_job
    txn = nil
    racing = lambda do |**_kw|
      txn = job.job_payment_transactions.initial_job_charge.last
      txn.update!(status: :processing, processing_at: Time.current, stripe_payment_intent_id: "pi_raced")
      JobStripeOps::Result.new(status: "failed", error: "late failure")
    end
    result = JobStripeOps.stub(:create_payment_intent!, racing) { JobFundingService.fund_for_publish!(job) }
    assert result[:processing]
    assert txn.reload.status_processing?
    assert_equal "pi_raced", txn.stripe_payment_intent_id
  end

  test "outcome_unknown never authorizes a technician transfer, even if the ledger were otherwise satisfied" do
    job = build_job
    fund_unknown(job)
    refute JobLedger.for(job).fully_funded

    # Even with a ledger that claims full funding, the unknown collection blocks payout.
    job.update!(technician_commission_percent_snapshot: 10)
    fake_ledger = OpenStruct.new(fully_funded: true, technician_net_payout_cents: 1_000, transferred_cents: 0, collected_cents: 0)
    JobLedger.stub(:for, fake_ledger) do
      result = PaymentService.release_to_technician(job.payments.order(:id).first)
      assert_match(/unconfirmed result/, result[:error].to_s)
    end
    assert_equal 0, job.reload.job_payment_transactions.where(transaction_type: :technician_transfer).count
  end
end

# Real concurrency needs committed rows and separate connections, so this class opts out of
# transactional tests and cleans up explicitly.
class CollectionOutcomeUnknownConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    skip "requires PostgreSQL row locks" unless ActiveRecord::Base.connection.adapter_name =~ /postg/i
    @company_user = User.create!(email: "unk-cc-#{SecureRandom.hex(4)}@example.com", password: "password123",
                                 password_confirmation: "password123", role: :company)
    @company_user.update_column(:stripe_customer_id, "cus_unknown_cc")
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
    @company_user.update_column(:company_profile_id, @company_profile.id)
    @job = Job.create!(
      company_profile: @company_profile, title: "Unknown job", description: "desc", status: :pending_funding,
      pay_basis: :guaranteed_job_pay, hourly_rate_cents: 7_500, hours_per_day: 8, days: 10,
      scheduled_start_at: 1.day.from_now, scheduled_end_at: 12.days.from_now, go_live_at: 3.days.ago
    )
  end

  teardown do
    if @job
      PaymentRiskEvent.where(job_id: @job.id).delete_all
      JobPaymentTransaction.where(job_id: @job.id).delete_all
      Payment.where(job_id: @job.id).delete_all
      JobFinancialRevision.where(job_id: @job.id).delete_all
      @job.reload.destroy
    end
    @company_profile&.destroy
    @company_user&.destroy
  end

  test "concurrent collect! calls for an unknown attempt create exactly one transaction and no second debit" do
    unknown = JobStripeOps::Result.new(status: "outcome_unknown", error: "timeout", error_class: "Stripe::APIConnectionError")
    JobStripeOps.stub(:create_payment_intent!, unknown) { JobFundingService.fund_for_publish!(@job) }
    amount = JobMoney.company_charge_cents(@job.reload.agreed_labor_cents, @job.company_commission_percent_snapshot)
    assert_equal 1, JobPaymentTransaction.where(job_id: @job.id).count

    creates = Concurrent::AtomicFixnum.new(0)
    results = Array.new(4)
    lookup_failed = JobStripeOps::PaymentIntentLookupResult.new(status: "lookup_failed", error: "timeout")
    JobStripeOps.stub(:create_payment_intent!, ->(**_kw) { creates.increment; unknown }) do
      JobStripeOps.stub(:find_payment_intent_for_attempt, lookup_failed) do
        4.times.map do |i|
          Thread.new do
            ActiveRecord::Base.connection_pool.with_connection do
              results[i] = JobFundingService.collect!(job: Job.find(@job.id), amount_cents: amount, transaction_type: :initial_job_charge, revision: 1)
            end
          end
        end.each(&:join)
      end
    end

    assert results.all? { |r| r && r[:outcome_unknown] }, results.inspect
    assert_equal 0, creates.value
    assert_equal 1, JobPaymentTransaction.where(job_id: @job.id, transaction_type: :initial_job_charge).count
  end
end
