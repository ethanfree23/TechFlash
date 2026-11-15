# frozen_string_literal: true

require "test_helper"
require "ostruct"

# Isolated $5 ACH smoke test: preconditions, one-shot execution, reconciliation, webhooks,
# and proof that no job money path is touched.
class InternalFinancialSmokeTestServiceTest < ActiveSupport::TestCase
  setup do
    PlatformSetting.where(key: AchAccess::GLOBAL_SETTING_KEY).delete_all
    PlatformSetting.create!(key: AchAccess::GLOBAL_SETTING_KEY, value_json: { "enabled" => true })
    ENV.delete("ACH_GLOBAL_DISABLED")

    @admin = User.create!(email: "smoke-admin-#{SecureRandom.hex(3)}@example.com", password: "password123",
                          password_confirmation: "password123", role: :admin)
    @company_user = User.create!(email: "smoke-co-#{SecureRandom.hex(3)}@example.com", password: "password123",
                                 password_confirmation: "password123", role: :company)
    @company_user.update_column(:stripe_customer_id, "cus_smoke_1")
    @company = CompanyProfile.create!(user: @company_user, membership_level: "basic", ach_payments_enabled: true)
    @company_user.update_column(:company_profile_id, @company.id)
    @other_company = CompanyProfile.create!(
      user: User.create!(email: "smoke-other-#{SecureRandom.hex(3)}@example.com", password: "password123",
                         password_confirmation: "password123", role: :company),
      membership_level: "basic", ach_payments_enabled: true
    )
    ENV[InternalFinancialSmokeTestService::COMPANY_ENV_KEY] = @company.id.to_s
    @old_key = Stripe.api_key
    Stripe.api_key = "sk_test_smoke"
    @counts = baseline_counts
  end

  teardown do
    ENV.delete(InternalFinancialSmokeTestService::COMPANY_ENV_KEY)
    ENV.delete("ACH_GLOBAL_DISABLED")
    Stripe.api_key = @old_key
  end

  def baseline_counts
    {
      jobs: Job.count, payments: Payment.count, txns: JobPaymentTransaction.count,
      revisions: JobFinancialRevision.count, transfers: JobPaymentTransaction.where(transaction_type: :technician_transfer).count,
      risk: PaymentRiskEvent.count
    }
  end

  def assert_no_job_money_side_effects
    assert_equal @counts, baseline_counts, "smoke test must not create Job/Payment/JobPaymentTransaction/transfer/revision rows"
  end

  def authorize(**overrides)
    InternalFinancialSmokeTestService.authorize!(**{
      company_profile_id: @company.id, operator: @admin, authorization_reference: "AUTH-#{SecureRandom.hex(4)}",
      authorized_at: Time.current, reason: "Owner-approved $5 production ACH smoke test", amount_cents: 500,
      payment_method_id: "pm_smoke_bank"
    }.merge(overrides))
  end

  def customer_obj(id = "cus_smoke_1")
    OpenStruct.new(id: id, deleted: false)
  end

  def bank_pm(customer: "cus_smoke_1", type: "us_bank_account", id: "pm_smoke_bank")
    OpenStruct.new(id: id, type: type, customer: customer, us_bank_account: OpenStruct.new(bank_name: "Chase", last4: "6789"))
  end

  def mandate_obj(id: "mandate_smoke_1", status: "active", payment_method: "pm_smoke_bank", type: "us_bank_account")
    OpenStruct.new(id: id, status: status, payment_method: payment_method,
                   payment_method_details: OpenStruct.new(type: type), type: "multi_use",
                   customer_acceptance: OpenStruct.new(type: "online"))
  end

  def setup_intent_list(pm_id: "pm_smoke_bank", mandate_id: "mandate_smoke_1", status: "succeeded")
    OpenStruct.new(data: [OpenStruct.new(id: "seti_smoke_1", status: status, payment_method: pm_id, mandate: mandate_id)])
  end

  def with_stripe_objects(pm: bank_pm, customer: customer_obj, setup_intents: setup_intent_list, mandate: mandate_obj, &block)
    Stripe::Customer.stub(:retrieve, ->(*_a) { customer }) do
      Stripe::PaymentMethod.stub(:retrieve, ->(*_a) { pm }) do
        Stripe::SetupIntent.stub(:list, ->(*a) { setup_intents.is_a?(Proc) ? setup_intents.call(*a) : setup_intents }) do
          Stripe::Mandate.stub(:retrieve, ->(*_a) { mandate }, &block)
        end
      end
    end
  end

  def created_intent(status:, id: "pi_smoke_1", **extra)
    OpenStruct.new({ id: id, status: status, amount: 500, currency: "usd", customer: "cus_smoke_1", latest_charge: nil,
                     metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true" } }.merge(extra))
  end

  # ---- authorization ----

  test "authorize records a single-use authorization with no Stripe write" do
    Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "no Stripe write on authorize" }) do
      test = authorize(authorization_reference: "AUTH-1")
      assert_match(/\Aifst_/, test.public_id)
      assert_equal "tf_smoke_#{test.public_id}", test.idempotency_key
      assert_equal "authorized", test.status
      assert_equal 500, test.amount_cents
      assert_equal "cus_smoke_1", test.stripe_customer_id
      assert_equal [@admin.id], Array(test.history_json).map { |h| h["operator_user_id"] }
    end
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(authorization_reference: "AUTH-1") }
    assert_no_job_money_side_effects
  end

  test "authorize rejects non-admin operator, wrong company, over-max amount, and bad payment method id" do
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(operator: @company_user) }
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(company_profile_id: @other_company.id) }
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(amount_cents: 501) }
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(amount_cents: 0) }
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(payment_method_id: "ba_123") }
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize(reason: " ") }
    ENV.delete(InternalFinancialSmokeTestService::COMPANY_ENV_KEY)
    assert_raises(InternalFinancialSmokeTestService::PreconditionError) { authorize }
    assert_equal 0, InternalFinancialSmokeTest.count
  end

  test "authorization fields are immutable" do
    test = authorize
    assert_raises(ActiveRecord::RecordInvalid) { test.update!(amount_cents: 100) }
    assert_raises(ActiveRecord::RecordInvalid) { test.update!(idempotency_key: "other") }
  end

  # ---- execution gates ----

  test "execute without LIVE_EXECUTE is a dry run that performs every check and never calls Stripe create" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "dry run must not create" }) do
        outcome = InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: false)
        assert outcome.dry_run
        assert_equal "authorized", test.reload.status
        assert_nil test.first_attempted_at
      end
    end
  end

  test "missing authorization record is rejected" do
    assert_raises(ActiveRecord::RecordNotFound) do
      InternalFinancialSmokeTestService.execute!(InternalFinancialSmokeTest.new(id: 999_999), operator: @admin, live_execute: true)
    end
  end

  test "global ACH OFF rejects execution before any Stripe call" do
    test = authorize
    ENV["ACH_GLOBAL_DISABLED"] = "true"
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "must not create" }) do
        err = assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
          InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
        end
        assert_match(/ACH is not permitted/, err.message)
      end
    end
    assert_equal "authorized", test.reload.status
  end

  test "per-company ACH OFF rejects execution" do
    test = authorize
    @company.update_column(:ach_payments_enabled, false)
    with_stripe_objects do
      assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    assert_equal "authorized", test.reload.status
  end

  test "wrong company (not the configured internal payer) is rejected at execution" do
    test = authorize
    ENV[InternalFinancialSmokeTestService::COMPANY_ENV_KEY] = @other_company.id.to_s
    with_stripe_objects do
      assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
  end

  test "payment method not owned by the customer, not a bank account, or customer not owned by company is rejected" do
    test = authorize
    [bank_pm(customer: "cus_other"), bank_pm(type: "card")].each do |pm|
      with_stripe_objects(pm: pm) do
        Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "must not create" }) do
          assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
            InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
          end
        end
      end
    end
    @company_user.update_column(:stripe_customer_id, "cus_changed")
    with_stripe_objects do
      assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    assert_equal "authorized", test.reload.status
  end

  test "non-admin operator cannot execute" do
    test = authorize
    with_stripe_objects do
      assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
        InternalFinancialSmokeTestService.execute!(test, operator: @company_user, live_execute: true)
      end
    end
  end

  test "a different admin than the authorizing administrator cannot execute" do
    other_admin = User.create!(email: "smoke-admin2-#{SecureRandom.hex(3)}@example.com", password: "password123",
                               password_confirmation: "password123", role: :admin)
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "must not reach Stripe" }) do
        err = assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
          InternalFinancialSmokeTestService.execute!(test, operator: other_admin, live_execute: true)
        end
        assert_match(/not the administrator who authorized/, err.message)
      end
    end
    assert_equal "authorized", test.reload.status
  end

  test "missing, inactive, or foreign mandate blocks execution before any Stripe write" do
    test = authorize
    Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "must not reach Stripe" }) do
      with_stripe_objects(setup_intents: OpenStruct.new(data: [])) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
      with_stripe_objects(setup_intents: setup_intent_list(status: "requires_action")) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
      with_stripe_objects(mandate: mandate_obj(status: "inactive")) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
      with_stripe_objects(mandate: mandate_obj(payment_method: "pm_someone_else")) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
      with_stripe_objects(mandate: mandate_obj(type: "card")) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
      with_stripe_objects(setup_intents: ->(*_a) { raise Stripe::APIConnectionError, "down" }) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
    end
    assert_equal "authorized", test.reload.status
    assert_nil test.first_attempted_at
  end

  test "execution records the verified mandate in history and the claim precedes the Stripe call" do
    test = authorize
    status_at_create = nil
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, lambda { |*_a|
        status_at_create = InternalFinancialSmokeTest.find(test.id).slice(:status, :first_attempted_at, :reconciliation_status)
        created_intent(status: "processing")
      }) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    assert_equal "outcome_unknown", status_at_create["status"], "row must already be attempted/unknown when Stripe is called"
    assert status_at_create["first_attempted_at"].present?
    assert_equal "pending_reconciliation", status_at_create["reconciliation_status"]
    kinds = Array(test.reload.history_json).map { |h| h["kind"] }
    assert_includes kinds, "mandate_verified"
    assert_includes kinds, "execute_claimed"
    assert_equal "mandate_smoke_1", Array(test.history_json).find { |h| h["kind"] == "execute_claimed" }["mandate_id"]
  end

  test "StripeModeGuard failure blocks execution" do
    test = authorize
    StripeModeGuard.stub(:check!, ->(*_a) { raise StripeModeGuard::Error, "Production Stripe secret key is not live mode" }) do
      assert_raises(StripeModeGuard::Error) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
    end
  end

  # ---- execution outcomes ----

  test "live execute performs exactly one PaymentIntent create with the stable key, isolated metadata, and no transfer_group" do
    test = authorize
    captured = []
    creator = lambda do |params, opts|
      captured << [params, opts]
      created_intent(status: "processing")
    end
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, creator) do
        outcome = InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
        assert_equal "processing", outcome.status
      end
    end
    assert_equal 1, captured.size
    params, opts = captured.first
    assert_equal test.idempotency_key, opts[:idempotency_key]
    assert_equal 500, params[:amount]
    assert_equal ["us_bank_account"], params[:payment_method_types]
    assert_equal "true", params[:metadata][InternalFinancialSmokeTest::METADATA_MARKER]
    assert_equal test.public_id, params[:metadata]["internal_smoke_test_id"]
    refute params.key?(:transfer_group)
    refute params.key?(:transfer_data)
    refute params.key?(:application_fee_amount)

    test.reload
    assert_equal "processing", test.status
    assert_equal "pi_smoke_1", test.stripe_payment_intent_id
    assert test.first_attempted_at.present?
    assert_no_job_money_side_effects
  end

  test "smoke success and failure are recorded; repeated execution is rejected in every attempted state" do
    ok = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { created_intent(status: "succeeded", latest_charge: "ch_smoke_1") }) do
        assert_equal "succeeded", InternalFinancialSmokeTestService.execute!(ok, operator: @admin, live_execute: true).status
      end
      assert_equal "ch_smoke_1", ok.reload.stripe_charge_id

      failed = authorize
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise Stripe::InvalidRequestError.new("No such payment_method", "payment_method", http_status: 400) }) do
        assert_equal "failed", InternalFinancialSmokeTestService.execute!(failed, operator: @admin, live_execute: true).status
      end

      unknown = authorize
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        assert_equal "outcome_unknown", InternalFinancialSmokeTestService.execute!(unknown, operator: @admin, live_execute: true).status
      end

      [ok, failed, unknown].each do |t|
        Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "second debit attempted for #{t.status}" }) do
          err = assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
            InternalFinancialSmokeTestService.execute!(t, operator: @admin, live_execute: true)
          end
          assert_match(/already attempted/, err.message)
        end
      end
    end
    assert_equal 1, InternalFinancialSmokeTest.where(status: "outcome_unknown").count
    assert_no_job_money_side_effects
  end

  test "process crash between stamp and Stripe response leaves the row attempted and unknown" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise "process died" }) do
        assert_raises(RuntimeError) { InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true) }
      end
    end
    test.reload
    assert_equal "outcome_unknown", test.status
    assert test.first_attempted_at.present?
    assert test.attempted?
  end

  # ---- reconciliation ----

  test "unknown smoke test reconciles from Stripe; lookup failure never permits a retry; same-key replay only after complete not-found in window" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end

      lookup_failed = JobStripeOps::PaymentIntentLookupResult.new(status: "lookup_failed", error: "cap")
      JobStripeOps.stub(:find_payment_intent_for_attempt, lookup_failed) do
        InternalFinancialSmokeTestService.reconcile!(test)
        assert_equal "outcome_unknown", test.reload.status
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
          InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
        end
      end

      not_found = JobStripeOps::PaymentIntentLookupResult.new(status: "not_found_after_complete_search")
      JobStripeOps.stub(:find_payment_intent_for_attempt, not_found) do
        InternalFinancialSmokeTestService.reconcile!(test)
      end
      keys = []
      Stripe::PaymentIntent.stub(:create, ->(_p, opts) { keys << opts[:idempotency_key]; created_intent(status: "processing") }) do
        assert_equal "processing", InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true).status
      end
      assert_equal [test.idempotency_key], keys

      # Outside the window a complete not-found requires admin, and replay is refused.
      stale = authorize
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        InternalFinancialSmokeTestService.execute!(stale, operator: @admin, live_execute: true)
      end
      stale.update_column(:first_attempted_at, 25.hours.ago)
      JobStripeOps.stub(:find_payment_intent_for_attempt, not_found) do
        InternalFinancialSmokeTestService.reconcile!(stale)
      end
      assert_equal "requires_admin", stale.reload.reconciliation_status
      Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "no retry outside window" }) do
        assert_raises(InternalFinancialSmokeTestService::PreconditionError) do
          InternalFinancialSmokeTestService.execute!(stale, operator: @admin, live_execute: true)
        end
      end
    end
  end

  test "reconcile found PaymentIntent applies authoritative state and rejects mismatches" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { raise Stripe::APIConnectionError.new("timeout") }) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    wrong = created_intent(status: "succeeded", amount: 600, metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true", "internal_smoke_test_id" => test.public_id })
    JobStripeOps.stub(:find_payment_intent_for_attempt, JobStripeOps::PaymentIntentLookupResult.new(status: "found", payment_intent: wrong)) do
      InternalFinancialSmokeTestService.reconcile!(test)
    end
    assert_equal "outcome_unknown", test.reload.status
    assert_equal "requires_admin", test.reconciliation_status

    right = created_intent(status: "succeeded", latest_charge: "ch_s", metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true", "internal_smoke_test_id" => test.public_id })
    JobStripeOps.stub(:find_payment_intent_for_attempt, JobStripeOps::PaymentIntentLookupResult.new(status: "found", payment_intent: right)) do
      InternalFinancialSmokeTestService.reconcile!(test)
    end
    test.reload
    assert_equal "succeeded", test.status
    assert_equal "pi_smoke_1", test.stripe_payment_intent_id
    assert_equal "ch_s", test.stripe_charge_id
  end

  # ---- webhooks ----

  def event(type, object, id: "evt_#{SecureRandom.hex(3)}")
    OpenStruct.new(id: id, type: type, created: Time.now.to_i, data: OpenStruct.new(object: object))
  end

  test "webhooks route smoke events by trusted metadata, dedupe, keep order safety, and record disputes" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { created_intent(status: "processing") }) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    meta = { InternalFinancialSmokeTest::METADATA_MARKER => "true", "internal_smoke_test_id" => test.public_id, "company_profile_id" => @company.id.to_s }
    processing = created_intent(status: "processing", metadata: meta)
    succeeded = created_intent(status: "succeeded", latest_charge: "ch_smoke_wh", metadata: meta)

    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.processing", processing, id: "evt_p1"))
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.processing", processing, id: "evt_p1"))
    assert_equal ["evt_p1"], test.reload.webhook_event_ids
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.succeeded", succeeded, id: "evt_s1"))
    assert_equal "succeeded", test.reload.status
    assert_equal "ch_smoke_wh", test.stripe_charge_id

    # Late processing after success never downgrades.
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.processing", processing, id: "evt_p2"))
    assert_equal "succeeded", test.reload.status

    # Mismatched amount is recorded but not applied.
    bad = created_intent(status: "requires_payment_method", amount: 999, metadata: meta)
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.payment_failed", bad, id: "evt_bad"))
    assert_equal "succeeded", test.reload.status
    assert_equal "requires_admin", test.reconciliation_status

    # ACH return / dispute later is reconcilable and recorded on the row.
    dispute = OpenStruct.new(id: "dp_smoke", charge: "ch_smoke_wh", payment_intent: "pi_smoke_1", status: "lost", reason: "insufficient_funds", amount: 500)
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("charge.dispute.closed", dispute, id: "evt_dp"))
    test.reload
    assert_equal "dp_smoke", test.stripe_dispute_id
    assert_equal "lost", test.dispute_status
    assert_equal "succeeded", test.status

    # Job-funding intents are not claimed.
    job_pi = OpenStruct.new(id: "pi_job", status: "succeeded", metadata: { "transaction_id" => "1" })
    refute InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.succeeded", job_pi))
    assert_no_job_money_side_effects
  end

  test "metadata-only match requires the trusted marker and a known smoke id" do
    test = authorize
    orphan = created_intent(status: "succeeded", id: "pi_orphan", metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true", "internal_smoke_test_id" => "ifst_nope" })
    assert InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.succeeded", orphan)), "marked intents are swallowed, never passed to job handlers"
    assert_equal "authorized", test.reload.status

    unmarked = created_intent(status: "succeeded", id: "pi_unmarked", metadata: { "internal_smoke_test_id" => test.public_id })
    refute InternalFinancialSmokeTestService.handle_webhook_event!(event("payment_intent.succeeded", unmarked))
    assert_equal "authorized", test.reload.status
  end

  test "rake-style flow: authorize, dry run, execute once, status output does not touch job tables" do
    test = authorize
    with_stripe_objects do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { created_intent(status: "processing") }) do
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: false)
        InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true)
      end
    end
    summary = InternalFinancialSmokeTestService.monitoring_summary
    assert_equal 1, summary[:unresolved].size
    assert_equal test.public_id, summary[:unresolved].first[:public_id]
    assert_no_job_money_side_effects
  end
end

# Two concurrent LIVE executions of the same authorization: exactly one may reach Stripe.
class InternalFinancialSmokeTestConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    skip "requires a multi-connection database" unless ActiveRecord::Base.connection.adapter_name =~ /postgres/i
    PlatformSetting.where(key: [AchAccess::GLOBAL_SETTING_KEY, AchAccess::PILOT_SETTING_KEY]).delete_all
    PlatformSetting.create!(key: AchAccess::GLOBAL_SETTING_KEY, value_json: { "enabled" => true })
    ENV.delete("ACH_GLOBAL_DISABLED")
    @admin = User.create!(email: "smoke-cc-admin-#{SecureRandom.hex(3)}@example.com", password: "password123",
                          password_confirmation: "password123", role: :admin)
    @company_user = User.create!(email: "smoke-cc-co-#{SecureRandom.hex(3)}@example.com", password: "password123",
                                 password_confirmation: "password123", role: :company)
    @company_user.update_column(:stripe_customer_id, "cus_smoke_cc")
    @company = CompanyProfile.create!(user: @company_user, membership_level: "basic", ach_payments_enabled: true, phone: "713-555-9000")
    @company_user.update_column(:company_profile_id, @company.id)
    ENV[InternalFinancialSmokeTestService::COMPANY_ENV_KEY] = @company.id.to_s
    @old_key = Stripe.api_key
    Stripe.api_key = "sk_test_smoke"
  end

  teardown do
    ENV.delete(InternalFinancialSmokeTestService::COMPANY_ENV_KEY)
    Stripe.api_key = @old_key
    InternalFinancialSmokeTest.where(company_profile_id: @company&.id).delete_all
    PlatformSetting.where(key: [AchAccess::GLOBAL_SETTING_KEY, AchAccess::PILOT_SETTING_KEY]).delete_all
    @company&.destroy
    @company_user&.destroy
    @admin&.destroy
  end

  test "concurrent execute! calls produce exactly one Stripe::PaymentIntent.create" do
    test = InternalFinancialSmokeTestService.authorize!(
      company_profile_id: @company.id, operator: @admin, authorization_reference: "CC-#{SecureRandom.hex(4)}",
      authorized_at: Time.current, reason: "concurrency", amount_cents: 500, payment_method_id: "pm_smoke_cc"
    )
    creates = Concurrent::AtomicFixnum.new(0)
    barrier = Concurrent::CyclicBarrier.new(2)
    pm = OpenStruct.new(id: "pm_smoke_cc", type: "us_bank_account", customer: "cus_smoke_cc",
                        us_bank_account: OpenStruct.new(bank_name: "Chase", last4: "0001"))
    mandate = OpenStruct.new(id: "mandate_cc", status: "active", payment_method: "pm_smoke_cc",
                             payment_method_details: OpenStruct.new(type: "us_bank_account"))
    setup_intents = OpenStruct.new(data: [OpenStruct.new(status: "succeeded", payment_method: "pm_smoke_cc", mandate: "mandate_cc")])
    outcomes = Concurrent::Array.new

    creator = lambda do |*_a|
      creates.increment
      sleep 0.3
      OpenStruct.new(id: "pi_cc_1", status: "processing", amount: 500, currency: "usd", customer: "cus_smoke_cc", latest_charge: nil,
                     metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true" })
    end

    Stripe::Customer.stub(:retrieve, ->(*_a) { OpenStruct.new(id: "cus_smoke_cc", deleted: false) }) do
      Stripe::PaymentMethod.stub(:retrieve, ->(*_a) { pm }) do
        Stripe::SetupIntent.stub(:list, ->(*_a) { setup_intents }) do
          Stripe::Mandate.stub(:retrieve, ->(*_a) { mandate }) do
            Stripe::PaymentIntent.stub(:create, creator) do
              threads = 2.times.map do
                Thread.new do
                  ActiveRecord::Base.connection_pool.with_connection do
                    barrier.wait(5)
                    begin
                      outcomes << InternalFinancialSmokeTestService.execute!(test, operator: @admin, live_execute: true).status
                    rescue InternalFinancialSmokeTestService::PreconditionError => e
                      outcomes << "refused: #{e.message}"
                    end
                  end
                end
              end
              threads.each(&:join)
            end
          end
        end
      end
    end

    assert_equal 1, creates.value, "exactly one executor may reach Stripe (outcomes=#{outcomes.inspect})"
    assert_equal 1, outcomes.count { |o| o == "processing" }
    assert_equal 1, outcomes.count { |o| o.to_s.start_with?("refused:") }
    test.reload
    assert_equal "processing", test.status
    assert_equal "pi_cc_1", test.stripe_payment_intent_id
    assert_equal 1, Array(test.history_json).count { |h| h["kind"] == "execute_claimed" }
  end
end
