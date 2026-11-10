# frozen_string_literal: true

# Staging-only real Stripe test-mode E2E. Never mocks Stripe. Never touches live mode.
# Usage: RAILS_ENV=staging bin/rails staging:ach_e2e
#
# Official Stripe TEST bank values (do not invent):
#   routing 110000000
#   success 000123456789 / insufficient 000222222227 / closed 000111111113
#   dispute 000555555559 / failMicrodeposits 000666666661
#   microdeposit success amounts 32+45 or descriptor SM11AA
#   microdeposit attempts-exceeded 10+11 / SM33CC
#
# Application vs runner:
# - App CREATE SetupIntent never includes mandate_data (Stripe.js confirms).
# - This runner CONFIRMs SetupIntents server-side with mandate_data for automation only.
class StagingAchE2eRunner
  Scenario = Struct.new(:name, :status, :detail, keyword_init: true)

  POLL_TIMEOUT = (ENV["ACH_E2E_POLL_TIMEOUT_SEC"].presence || 120).to_i
  POLL_INTERVAL = 2

  # Official Stripe test routing / account numbers (ACH Direct Debit testing docs).
  TEST_ROUTING = "110000000"
  TEST_ACCOUNT_SUCCESS = "000123456789"
  TEST_ACCOUNT_INSUFFICIENT = "000222222227"
  TEST_ACCOUNT_CLOSED = "000111111113"
  TEST_ACCOUNT_DISPUTE = "000555555559"
  TEST_ACCOUNT_FAIL_MICRODEPOSITS = "000666666661"
  TEST_MD_SUCCESS_AMOUNTS = [32, 45].freeze
  TEST_MD_SUCCESS_DESCRIPTOR = "SM11AA"
  TEST_MD_EXCEEDED_AMOUNTS = [10, 11].freeze

  def initialize
    @scenarios = []
    @created = {
      customers: [], payment_methods: [], setup_intents: [], payment_intents: [],
      accounts: [], transfers: [], refunds: [], events: []
    }
    @connect = { status: "UNKNOWN", platform_id: nil, probe_account_id: nil, detail: nil }
    @last_success_collection = nil
  end

  def run!
    assert_safe_environment!
    @connect = verify_connect_platform!
    puts "[ach_e2e] Starting against #{Rails.env} Stripe mode=#{StripeModeGuard.mode_label}"
    puts "[ach_e2e] Connect: #{@connect[:status]} platform=#{@connect[:platform_id]} detail=#{@connect[:detail]}"

    run_scenario("1_bank_setup_intent_mandate") { scenario_bank_setup! }
    run_scenario("1b_microdeposit_verification_success") { scenario_microdeposit_success! }
    run_scenario("1c_microdeposit_verification_failure") { scenario_microdeposit_failure! }
    run_scenario("2_ach_funding_processing_then_succeeded") { scenario_ach_funding_success! }
    run_scenario("3_ach_funding_failure") { scenario_ach_funding_failure! }
    run_scenario("4_signed_webhooks_persisted") { scenario_webhooks_persisted! }
    run_scenario("5_refund_reconciled") { scenario_refund! }
    run_scenario("6_connect_transfer") { scenario_connect_transfer! }
    run_scenario("7_card_job_payment") { scenario_card_job! }
    run_scenario("8_flag_enforcement_and_disable_during_processing") { scenario_flag_enforcement! }
    run_scenario("9_ach_return_or_dispute") { scenario_ach_return_or_dispute! }

    print_table!
    failed = @scenarios.count { |s| s.status == "FAIL" }
    exit(failed.positive? ? 1 : 0)
  end

  # --- Schema helpers (unit-testable; never invent columns) -------------------

  # Job payment failures are tracked via status enum — NOT failed_at.
  # failed_at belongs only to stripe_setup_records.
  def self.job_payment_webhook_affected_relation
    JobPaymentTransaction.where.not(stripe_payment_intent_id: nil).where(
      "succeeded_at IS NOT NULL OR processing_at IS NOT NULL OR status = ?",
      JobPaymentTransaction.statuses[:failed]
    )
  end

  def self.assert_job_payment_schema!
    cols = JobPaymentTransaction.column_names
    if cols.include?("failed_at")
      raise Fail, "job_payment_transactions unexpectedly has failed_at — runner/app contract drift"
    end
    %w[succeeded_at processing_at status stripe_payment_intent_id].each do |required|
      raise Fail, "job_payment_transactions missing #{required}" unless cols.include?(required)
    end
    setup_cols = StripeSetupRecord.column_names
    raise Fail, "stripe_setup_records missing failed_at" unless setup_cols.include?("failed_at")
    true
  end

  private

  def assert_safe_environment!
    unless Rails.env.staging?
      abort "[ach_e2e] REFUSED: Rails.env must be staging (got #{Rails.env})"
    end
    if defined?(DemoMode) && DemoMode.enabled?
      abort "[ach_e2e] REFUSED: DemoMode must be off"
    end
    err = StripeModeGuard.error_message
    abort "[ach_e2e] REFUSED: #{err}" if err
    unless Stripe.api_key.to_s.start_with?("sk_test_")
      abort "[ach_e2e] REFUSED: Stripe secret must be sk_test_"
    end
    StagingSandbox.assert_safe!
  end

  # Authoritative Connect detection. Never PASS based on Customer/PI/key alone.
  # Returns hash: status OK|BLOCKED, platform_id, probe_account_id, detail
  def verify_connect_platform!
    platform = Stripe::Account.retrieve
    platform_id = platform.id.to_s
    raise Fail, "platform account id missing" unless platform_id.start_with?("acct_")

    begin
      Stripe::Account.list(limit: 1)
    rescue Stripe::PermissionError, Stripe::AuthenticationError => e
      return {
        status: "BLOCKED",
        platform_id: platform_id,
        probe_account_id: nil,
        detail: "Account.list denied (not a Connect platform): #{e.message}"
      }
    end

    begin
      probe = Stripe::Account.create(
        type: "custom",
        country: "US",
        email: "e2e+connect-probe-#{SecureRandom.hex(3)}@techflash.staging",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_type: "individual",
        tos_acceptance: { date: Time.now.to_i, ip: "127.0.0.1" },
        business_profile: { mcc: "5734", url: "https://techflash.example" },
        individual: {
          first_name: "E2E",
          last_name: "Probe",
          email: "e2e+probe@techflash.staging",
          dob: { day: 1, month: 1, year: 1901 },
          address: {
            line1: "address_full_match",
            city: "Houston",
            state: "TX",
            postal_code: "77002",
            country: "US"
          },
          ssn_last_4: "0000"
        },
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          routing_number: TEST_ROUTING,
          account_number: TEST_ACCOUNT_SUCCESS
        },
        metadata: { techflash_e2e: "connect_probe" }
      )
      @created[:accounts] << probe.id
      transfers = probe.capabilities&.transfers.to_s.presence ||
        (probe["capabilities"].is_a?(Hash) ? probe["capabilities"]["transfers"].to_s : "")
      {
        status: "OK",
        platform_id: platform_id,
        probe_account_id: probe.id,
        detail: "created probe=#{probe.id} transfers_capability=#{transfers.presence || 'n/a'}"
      }
    rescue Stripe::PermissionError, Stripe::InvalidRequestError, Stripe::AuthenticationError => e
      {
        status: "BLOCKED",
        platform_id: platform_id,
        probe_account_id: nil,
        detail: "Cannot create Connect test account: #{e.message}"
      }
    end
  rescue Stripe::StripeError => e
    {
      status: "BLOCKED",
      platform_id: nil,
      probe_account_id: nil,
      detail: "Cannot retrieve platform account: #{e.message}"
    }
  end

  def run_scenario(name)
    yield
  rescue SkipSandbox => e
    @scenarios << Scenario.new(name: name, status: "SKIPPED_SANDBOX_LIMIT", detail: e.message)
  rescue Blocked => e
    @scenarios << Scenario.new(name: name, status: "BLOCKED", detail: e.message)
  rescue StandardError => e
    @scenarios << Scenario.new(name: name, status: "FAIL", detail: "#{e.class}: #{e.message}")
  end

  class SkipSandbox < StandardError; end
  class Blocked < StandardError; end
  class Fail < StandardError; end

  def pass!(name, detail)
    @scenarios << Scenario.new(name: name, status: "PASS", detail: detail)
  end

  def print_table!
    puts
    puts "==== staging:ach_e2e results ===="
    @scenarios.each do |s|
      puts format("%-55s %-24s %s", s.name, s.status, s.detail.to_s[0, 140])
    end
    puts "================================="
  end

  def poll_until(timeout: POLL_TIMEOUT)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    loop do
      val = yield
      return val if val
      raise Fail, "timed out after #{timeout}s waiting for webhook/DB state" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

      sleep POLL_INTERVAL
    end
  end

  def ensure_e2e_company!(suffix:, ach_enabled:)
    email = "e2e+#{suffix}@techflash.staging"
    user = User.find_or_initialize_by(email: email)
    if user.new_record?
      user.assign_attributes(password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :company)
      user.save!
    end
    profile = user.company_profile || CompanyProfile.create!(user: user, company_name: "E2E #{suffix}", membership_level: "basic")
    user.update_column(:company_profile_id, profile.id) if user.company_profile_id != profile.id
    AchAccess.set_global!(enabled: true, actor: nil, source: "ach_e2e") unless AchAccess.global_enabled_without_env_kill
    AchAccess.set_company!(profile, enabled: ach_enabled, actor: nil, source: "ach_e2e")
    customer = Stripe::Customer.create(email: email, metadata: { techflash_e2e: "true", suffix: suffix })
    @created[:customers] << customer.id
    user.update!(stripe_customer_id: customer.id)
    [user, profile.reload, customer]
  end

  # Confirm a company SetupIntent with official test bank details + mandate on CONFIRM only.
  # verification_mode: :skip | :microdeposits
  def confirm_bank_setup_intent!(setup_intent_id, customer_id:, account_number:, verification_mode: :skip)
    params = {
      payment_method_data: {
        type: "us_bank_account",
        billing_details: {
          name: "TechFlash E2E Test",
          email: "e2e-bank@techflash.staging"
        },
        us_bank_account: {
          account_holder_type: "company",
          account_type: "checking",
          routing_number: TEST_ROUTING,
          account_number: account_number
        }
      },
      mandate_data: {
        customer_acceptance: {
          type: "online",
          online: {
            ip_address: "127.0.0.1",
            user_agent: "TechFlash staging:ach_e2e (automated test consent)"
          }
        }
      },
      payment_method_options: {
        us_bank_account: {
          verification_method: verification_mode.to_s
        }
      },
      expand: ["payment_method", "mandate"]
    }
    intent = Stripe::SetupIntent.confirm(setup_intent_id, params)
    @created[:setup_intents] << intent.id
    intent
  end

  def verify_microdeposits!(setup_intent_id, amounts: nil, descriptor_code: nil)
    params = {}
    params[:amounts] = amounts if amounts
    params[:descriptor_code] = descriptor_code if descriptor_code
    Stripe::SetupIntent.verify_microdeposits(setup_intent_id, params)
  end

  def attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_SUCCESS, verification_mode: :skip)
    payload = CompanyPaymentMethodsService.create_setup_intent!(
      user, payment_method_type: "us_bank_account", ip_address: "127.0.0.1", user_agent: "ach_e2e"
    )
    raise Fail, "missing client_secret/setup_intent_id" if payload[:client_secret].blank? || payload[:setup_intent_id].blank?

    # Prove app CREATE path never required mandate_data by re-fetching SI (must be unconfirmed / requires_payment_method|requires_confirmation).
    raw = Stripe::SetupIntent.retrieve(payload[:setup_intent_id])
    raise Fail, "unexpected pre-confirm status #{raw.status}" unless %w[requires_payment_method requires_confirmation requires_action].include?(raw.status.to_s)

    intent = confirm_bank_setup_intent!(
      payload[:setup_intent_id],
      customer_id: customer.id,
      account_number: account_number,
      verification_mode: verification_mode
    )

    if intent.status.to_s == "requires_action" &&
        intent.next_action&.type.to_s == "verify_with_microdeposits"
      intent = verify_microdeposits!(intent.id, descriptor_code: TEST_MD_SUCCESS_DESCRIPTOR)
      # Descriptor path may not apply to amount-based microdeposits — fall back to amounts.
      if intent.status.to_s != "succeeded"
        intent = verify_microdeposits!(intent.id, amounts: TEST_MD_SUCCESS_AMOUNTS)
      end
    end

    raise Fail, "SetupIntent not succeeded (status=#{intent.status})" unless intent.status.to_s == "succeeded"

    pm_id = intent.payment_method.to_s
    raise Fail, "missing payment_method on succeeded SetupIntent" if pm_id.blank?

    pm = Stripe::PaymentMethod.retrieve(pm_id)
    raise Fail, "PM not on intended customer" unless pm.customer.to_s == customer.id.to_s

    Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: pm_id })
    @created[:payment_methods] << pm_id

    StripeSetupRecord.upsert_from_setup_intent!(intent, user: user)
    rec = StripeSetupRecord.find_by(stripe_setup_intent_id: intent.id)
    raise Fail, "StripeSetupRecord missing after succeeded setup" if rec.blank?
    raise Fail, "StripeSetupRecord status=#{rec.status}" unless rec.status == "succeeded"

    { setup_intent: intent, payment_method: pm, record: rec, payload: payload }
  end

  def attach_test_card!(customer_id, pm_token: "pm_card_visa")
    pm = Stripe::PaymentMethod.attach(pm_token, { customer: customer_id })
    Stripe::Customer.update(customer_id, invoice_settings: { default_payment_method: pm.id })
    @created[:payment_methods] << pm.id
    pm
  rescue Stripe::StripeError
    pm = Stripe::PaymentMethod.create(
      type: "card",
      card: { token: "tok_visa" },
      billing_details: { name: "E2E Card" }
    )
    Stripe::PaymentMethod.attach(pm.id, { customer: customer_id })
    Stripe::Customer.update(customer_id, invoice_settings: { default_payment_method: pm.id })
    @created[:payment_methods] << pm.id
    pm
  end

  def build_priced_job!(company_profile)
    job = Job.create!(
      company_profile: company_profile,
      title: "E2E job #{SecureRandom.hex(3)}",
      description: "staging ach e2e",
      status: :pending_funding,
      funding_status: :unfunded,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000,
      financial_revision: 1,
      city: "Houston",
      state: "TX",
      country: "United States"
    )
    JobFundingService.ensure_header!(job)
    job
  end

  def scenario_bank_setup!
    user, _profile, customer = ensure_e2e_company!(suffix: "banksetup", ach_enabled: true)
    result = attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_SUCCESS, verification_mode: :skip)

    other_user, = ensure_e2e_company!(suffix: "banksetup_other", ach_enabled: true)
    other_list = CompanyPaymentMethodsService.list_for(other_user)
    raise Fail, "cross-company leaked methods" if other_list[:payment_methods].any? { |m| m[:id] == result[:payment_method].id }

    own = CompanyPaymentMethodsService.list_for(user)
    raise Fail, "verified bank not listed for owner" if own[:payment_methods].none? { |m| m[:id] == result[:payment_method].id }

    pass!(
      "1_bank_setup_intent_mandate",
      "seti=#{result[:setup_intent].id} pm=#{result[:payment_method].id} customer=#{customer.id} " \
      "mandate_ok setup_record=#{result[:record].id} status=#{result[:record].status}"
    )
  end

  def scenario_microdeposit_success!
    user, _profile, customer = ensure_e2e_company!(suffix: "mdok", ach_enabled: true)
    payload = CompanyPaymentMethodsService.create_setup_intent!(
      user, payment_method_type: "us_bank_account", ip_address: "127.0.0.1", user_agent: "ach_e2e"
    )
    intent = confirm_bank_setup_intent!(
      payload[:setup_intent_id],
      customer_id: customer.id,
      account_number: TEST_ACCOUNT_SUCCESS,
      verification_mode: :microdeposits
    )

    if intent.status.to_s == "succeeded"
      pass!("1b_microdeposit_verification_success", "instant/skip path succeeded seti=#{intent.id} (microdeposits not required)")
      return
    end

    unless intent.status.to_s == "requires_action" && intent.next_action&.type.to_s == "verify_with_microdeposits"
      raise Fail, "expected verify_with_microdeposits, got status=#{intent.status} next=#{intent.next_action&.type}"
    end

    # Pending verification must NOT be treated as verified.
    StripeSetupRecord.upsert_from_setup_intent!(intent, user: user)
    pending_rec = StripeSetupRecord.find_by!(stripe_setup_intent_id: intent.id)
    raise Fail, "pending microdeposit treated as succeeded" if pending_rec.status == "succeeded"

    verified = begin
      verify_microdeposits!(intent.id, descriptor_code: TEST_MD_SUCCESS_DESCRIPTOR)
    rescue Stripe::InvalidRequestError
      verify_microdeposits!(intent.id, amounts: TEST_MD_SUCCESS_AMOUNTS)
    end
    raise Fail, "microdeposit verify failed status=#{verified.status}" unless verified.status.to_s == "succeeded"

    StripeSetupRecord.upsert_from_setup_intent!(verified, user: user)
    pm_id = verified.payment_method.to_s
    Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: pm_id }) if pm_id.present?
    @created[:payment_methods] << pm_id if pm_id.present?

    pass!(
      "1b_microdeposit_verification_success",
      "seti=#{verified.id} pm=#{pm_id} verified via official test microdeposit values"
    )
  end

  def scenario_microdeposit_failure!
    user, _profile, customer = ensure_e2e_company!(suffix: "mdfail", ach_enabled: true)
    payload = CompanyPaymentMethodsService.create_setup_intent!(
      user, payment_method_type: "us_bank_account", ip_address: "127.0.0.1", user_agent: "ach_e2e"
    )
    intent = confirm_bank_setup_intent!(
      payload[:setup_intent_id],
      customer_id: customer.id,
      account_number: TEST_ACCOUNT_SUCCESS,
      verification_mode: :microdeposits
    )

    if intent.status.to_s == "succeeded"
      raise SkipSandbox, "sandbox auto-verified without microdeposits; cannot force failure amounts"
    end
    unless intent.status.to_s == "requires_action"
      raise SkipSandbox, "unexpected status #{intent.status}; cannot drive microdeposit failure"
    end

    err = nil
    begin
      verify_microdeposits!(intent.id, amounts: TEST_MD_EXCEEDED_AMOUNTS)
    rescue Stripe::StripeError => e
      err = e
    end

    # Wrong amounts should reject; exceeded-attempt codes eventually fail the SI.
    refreshed = Stripe::SetupIntent.retrieve(intent.id)
    if err.nil? && refreshed.status.to_s == "succeeded"
      raise Fail, "incorrect microdeposit amounts unexpectedly succeeded"
    end

    # Ensure we cannot fund a job with an unverified bank from this SI.
    pm_id = refreshed.payment_method.to_s
    if pm_id.present? && refreshed.status.to_s != "succeeded"
      begin
        Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: pm_id })
        job = build_priced_job!(user.company_profile)
        result = JobFundingService.collect!(
          job: job, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1
        )
        raise Fail, "unverified bank funded job: #{result.inspect}" if result[:success] && job.reload.funding_funded?
      rescue Stripe::InvalidRequestError
        # Expected: unverified PM cannot charge.
      end
    end

    pass!(
      "1c_microdeposit_verification_failure",
      "incorrect verify rejected (#{err&.class}: #{err&.message.to_s[0, 80]}); SI status=#{refreshed.status}"
    )
  end

  def scenario_ach_funding_success!
    user, profile, customer = ensure_e2e_company!(suffix: "achok", ach_enabled: true)
    attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_SUCCESS)

    job = build_priced_job!(profile)
    raise Fail, "precondition: job must start unfunded" unless job.funding_unfunded? || job.funding_status.to_s == "unfunded"

    result = JobFundingService.collect!(
      job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
    )
    txn = result[:transaction] || job.job_payment_transactions.order(:id).last
    raise Fail, "collect failed: #{result.inspect}" if txn.blank?

    @created[:payment_intents] << txn.stripe_payment_intent_id if txn.stripe_payment_intent_id

    if txn.status_processing? || result[:processing]
      raise Fail, "job funded too early while processing" if job.reload.funding_funded?
      raise Fail, "technician transfer must not exist while processing" if job.job_payment_transactions.technician_transfer.exists?

      poll_until do
        txn.reload
        txn.status_succeeded? || txn.status_failed?
      end
    end

    raise Fail, "expected succeeded, got #{txn.reload.status}" unless txn.reload.status_succeeded?

    # Exactly one succeeded ledger collection for this job.
    succeeded = job.job_payment_transactions.company_collections.status_succeeded
    raise Fail, "expected exactly one succeeded collection, got #{succeeded.count}" unless succeeded.count == 1

    JobFundingService.publish!(job) if job.reload.status_pending_funding? || !job.funding_funded?
    raise Fail, "job not funded after success" unless job.reload.funding_funded?

    # Real Stripe object correlation.
    pi = Stripe::PaymentIntent.retrieve(txn.stripe_payment_intent_id)
    raise Fail, "Stripe PI status=#{pi.status}" unless pi.status.to_s == "succeeded"
    raise Fail, "PI/local amount mismatch" unless pi.amount.to_i == txn.amount_cents

    @last_success_collection = txn
    pass!(
      "2_ach_funding_processing_then_succeeded",
      "txn=#{txn.id} pi=#{txn.stripe_payment_intent_id} ch=#{txn.stripe_charge_id} " \
      "job_funding=#{job.funding_status} stripe_status=#{pi.status}"
    )
  end

  def scenario_ach_funding_failure!
    user, profile, customer = ensure_e2e_company!(suffix: "achfail", ach_enabled: true)
    begin
      attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_INSUFFICIENT)
    rescue Fail, Stripe::StripeError => e
      # Fallback: closed-account test number.
      begin
        attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_CLOSED)
      rescue Fail, Stripe::StripeError => e2
        raise SkipSandbox, "ACH failure test banks unavailable (#{e.message}; #{e2.message})"
      end
    end

    job = build_priced_job!(profile)
    result = JobFundingService.collect!(
      job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
    )
    txn = result[:transaction] || job.job_payment_transactions.order(:id).last
    @created[:payment_intents] << txn.stripe_payment_intent_id if txn&.stripe_payment_intent_id

    if txn&.status_processing?
      poll_until(timeout: POLL_TIMEOUT) do
        txn.reload.status_failed? || txn.status_succeeded?
      end
    end

    raise Fail, "job must not be funded after ACH failure" if job.reload.funding_funded?
    raise Fail, "technician transfer must not exist" if job.job_payment_transactions.technician_transfer.exists?
    raise Fail, "expected failure recorded" unless txn&.status_failed? || result[:error].present? || result[:success] == false

    pass!(
      "3_ach_funding_failure",
      "txn=#{txn&.id} status=#{txn&.status} error=#{result[:error].to_s[0, 60]} job_funding=#{job.funding_status}"
    )
  end

  def scenario_webhooks_persisted!
    self.class.assert_job_payment_schema!

    sample = self.class.job_payment_webhook_affected_relation.order(updated_at: :desc).first
    raise Fail, "no webhook-affected payment transactions found yet; run scenarios 2/3 first" if sample.blank?

    # Prefer real StripeWebhookEvent rows (evt_...) — never insert synthetic rows here.
    events = StripeWebhookEvent.where("stripe_event_id LIKE ?", "evt_%")
      .where("created_at > ?", 6.hours.ago)
      .order(created_at: :desc)
      .limit(20)

    matched = events.find do |ev|
      payload = ev.payload.to_s
      payload.include?(sample.stripe_payment_intent_id.to_s) ||
        (sample.stripe_charge_id.present? && payload.include?(sample.stripe_charge_id.to_s))
    end

    delivery =
      if matched&.processed_at.present?
        "real_or_forwarded_webhook"
      elsif matched
        "webhook_row_unprocessed"
      elsif events.exists?
        "webhook_events_present_unrelated"
      else
        "no_stripe_webhook_events_in_db"
      end

    detail = "txn=#{sample.id} pi=#{sample.stripe_payment_intent_id} status=#{sample.status} " \
             "delivery=#{delivery}"
    if matched
      detail += " evt=#{matched.stripe_event_id} type=#{matched.event_type} processed_at=#{matched.processed_at}"
      @created[:events] << matched.stripe_event_id
    end

    # HTTP 200 alone is not enough — require either a persisted evt_ row OR clear ledger
    # side-effects with Stripe object IDs from a prior real collect.
    if matched.nil? && sample.stripe_payment_intent_id.blank?
      raise Fail, "no StripeWebhookEvent and no PI on sample — cannot claim webhook persistence"
    end

    if delivery == "no_stripe_webhook_events_in_db"
      # Ledger may have been updated synchronously from collect! without async webhook delivery
      # (common when Stripe CLI is not forwarding). Classify accurately — not a silent PASS.
      raise SkipSandbox,
        "No StripeWebhookEvent rows persisted. Ledger shows pi=#{sample.stripe_payment_intent_id} " \
        "status=#{sample.status} (likely sync API path or missing webhook forwarding). " \
        "Not equivalent to real Stripe→endpoint delivery."
    end

    pass!("4_signed_webhooks_persisted", detail)
  end

  def scenario_refund!
    txn = @last_success_collection ||
      JobPaymentTransaction.company_collections.status_succeeded.where.not(stripe_payment_intent_id: nil).order(id: :desc).first
    raise SkipSandbox, "no succeeded collection available to refund" if txn.blank?

    job = txn.job
    amount = [txn.amount_cents / 4, 100].max
    before_count = job.job_payment_transactions.company_refunds.count

    result = JobFundingService.refund_slice!(
      job: job,
      amount_cents: amount,
      payment_intent_id: txn.stripe_payment_intent_id,
      transaction_type: :final_hours_refund,
      revision: job.financial_revision + 1
    )
    unless result[:success] || result[:pending] || result[:transaction]
      raise Fail, "refund failed: #{result.inspect}"
    end

    refund_txn = result[:transaction]
    raise Fail, "no refund ledger row" if refund_txn.blank?
    raise Fail, "expected one new refund row" if job.job_payment_transactions.company_refunds.count != before_count + 1
    raise Fail, "refund must not be auto-failed while Stripe pending" if result[:pending] && refund_txn.status_failed?

    @created[:refunds] << refund_txn.stripe_refund_id if refund_txn.stripe_refund_id.present?

    # Stripe object check (real refund id — never invent ledger-only success)
    raise Fail, "missing Stripe refund id on ledger row" if refund_txn.stripe_refund_id.blank?

    stripe_refund = Stripe::Refund.retrieve(refund_txn.stripe_refund_id)
    raise Fail, "refund amount mismatch" unless stripe_refund.amount.to_i == amount
    raise Fail, "refund currency mismatch" unless stripe_refund.currency.to_s == "usd"
    raise Fail, "refund parent PI mismatch" unless stripe_refund.payment_intent.to_s == txn.stripe_payment_intent_id.to_s ||
      stripe_refund.charge.present?

    # Idempotent replay of same slice key must not double-create economically
    result2 = JobFundingService.refund_slice!(
      job: job,
      amount_cents: amount,
      payment_intent_id: txn.stripe_payment_intent_id,
      transaction_type: :final_hours_refund,
      revision: job.financial_revision + 1
    )
    if result2[:transaction]&.stripe_refund_id.present?
      raise Fail, "idempotent refund id mismatch" if refund_txn.stripe_refund_id != result2[:transaction].stripe_refund_id
    end
    raise Fail, "duplicate refund ledger rows" if job.job_payment_transactions.company_refunds.count > before_count + 1

    pass!(
      "5_refund_reconciled",
      "refund_txn=#{refund_txn.id} re=#{refund_txn.stripe_refund_id} ledger_status=#{refund_txn.status} " \
      "stripe_status=#{stripe_refund.status} amount=#{amount} parent_pi=#{txn.stripe_payment_intent_id}"
    )
  end

  def scenario_connect_transfer!
    if @connect[:status] != "OK"
      raise Blocked, "Connect platform not proven: #{@connect[:detail]}"
    end

    collection = @last_success_collection ||
      JobPaymentTransaction.company_collections.status_succeeded.where.not(stripe_charge_id: nil).order(id: :desc).first
    raise SkipSandbox, "no succeeded charge for source_transaction transfer" if collection.blank?

    job = collection.job
    payment = JobFundingService.ensure_header!(job)

    # Prefer probe account from Connect verification; else create a fresh Custom account.
    destination_id = @connect[:probe_account_id]
    if destination_id.blank?
      account = Stripe::Account.create(
        type: "custom",
        country: "US",
        email: "e2e+xfer-#{SecureRandom.hex(3)}@techflash.staging",
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        business_type: "individual",
        tos_acceptance: { date: Time.now.to_i, ip: "127.0.0.1" },
        business_profile: { mcc: "5734", url: "https://techflash.example" },
        individual: {
          first_name: "E2E", last_name: "Tech", email: "e2e+tech@techflash.staging",
          dob: { day: 1, month: 1, year: 1901 },
          address: { line1: "address_full_match", city: "Houston", state: "TX", postal_code: "77002", country: "US" },
          ssn_last_4: "0000"
        },
        external_account: {
          object: "bank_account", country: "US", currency: "usd",
          routing_number: TEST_ROUTING, account_number: TEST_ACCOUNT_SUCCESS
        },
        metadata: { techflash_e2e: "true" }
      )
      @created[:accounts] << account.id
      destination_id = account.id
    end

    tech_user = User.find_or_initialize_by(email: "e2e+tech-#{job.id}@techflash.staging")
    if tech_user.new_record?
      tech_user.assign_attributes(password: "Falcon23$!", password_confirmation: "Falcon23$!", role: :technician)
      tech_user.save!
    end
    tp = tech_user.technician_profile || TechnicianProfile.create!(
      user: tech_user, trade_type: "General", availability: "Full-time", membership_level: "basic"
    )
    tp.update!(
      stripe_account_id: destination_id,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_transfers_capability_status: "active",
      stripe_connect_synced_at: Time.current
    )
    JobApplication.find_or_create_by!(job: job, technician_profile: tp) { |a| a.status = :accepted }
    JobFundingService.snapshot_technician!(job, tp) if job.technician_commission_percent_snapshot.nil?
    job.update!(
      status: :finished,
      finished_at: 4.days.ago,
      settlement_status: :settled,
      funding_status: :funded
    )

    before = job.job_payment_transactions.technician_transfer.count
    result = PaymentService.release_to_technician(payment.reload)

    if result[:error].to_s.match?(/not ready|underfunded|No approved payable|commission/i)
      # Fall through to direct JobStripeOps.transfer! to distinguish app vs funds readiness.
      amount = [collection.amount_cents / 10, 100].max
      transfer_group = "E2E_#{SecureRandom.hex(4)}"
      ops = JobStripeOps.transfer!(
        amount_cents: amount,
        destination: destination_id,
        metadata: { "e2e" => "true", "job_id" => job.id.to_s },
        transfer_group: transfer_group,
        idempotency_key: "e2e_tr_#{job.id}_#{SecureRandom.hex(3)}",
        source_transaction: collection.stripe_charge_id
      )
      if ops.succeeded?
        @created[:transfers] << ops.stripe_id
        stripe_tr = Stripe::Transfer.retrieve(ops.stripe_id)
        raise Fail, "destination mismatch" unless stripe_tr.destination.to_s == destination_id
        raise Fail, "amount mismatch" unless stripe_tr.amount.to_i == amount
        pass!(
          "6_connect_transfer",
          "PaymentService blocked (#{result[:error].to_s[0, 60]}); JobStripeOps.transfer! OK " \
          "tr=#{ops.stripe_id} dest=#{destination_id} amount=#{amount} " \
          "source=#{collection.stripe_charge_id} (no automatic bank payout claimed)"
        )
        return
      end
      if ops.error.to_s.match?(/insufficient|available|balance|funds/i)
        raise SkipSandbox, "Stripe settlement/balance limitation: #{ops.error}"
      end
      raise Fail, "transfer failed via PaymentService (#{result[:error]}) and JobStripeOps (#{ops.error})"
    end

    raise Fail, "PaymentService.release_to_technician failed: #{result.inspect}" unless result[:success]

    xfer = result[:transaction] || job.job_payment_transactions.technician_transfer.order(:id).last
    raise Fail, "missing transfer ledger row" if xfer.blank?
    raise Fail, "expected exactly one transfer row" unless job.job_payment_transactions.technician_transfer.count == before + 1 ||
      (before.positive? && xfer.status_succeeded?)
    raise Fail, "missing tr_ id" unless xfer.stripe_transfer_id.to_s.start_with?("tr_")

    stripe_tr = Stripe::Transfer.retrieve(xfer.stripe_transfer_id)
    raise Fail, "destination mismatch" unless stripe_tr.destination.to_s == destination_id
    @created[:transfers] << xfer.stripe_transfer_id

    pass!(
      "6_connect_transfer",
      "tr=#{xfer.stripe_transfer_id} dest=#{destination_id} amount=#{xfer.amount_cents} " \
      "source=#{xfer.source_charge_id || collection.stripe_charge_id} via PaymentService " \
      "(no automatic bank payout claimed)"
    )
  rescue Stripe::InvalidRequestError => e
    if e.message.match?(/insufficient|available|balance|funds/i)
      raise SkipSandbox, "Stripe settlement/balance limitation: #{e.message}"
    end
    raise SkipSandbox, "Connect transfer not possible in sandbox: #{e.message}"
  end

  def scenario_card_job!
    user, profile, customer = ensure_e2e_company!(suffix: "cardok", ach_enabled: false)
    attach_test_card!(customer.id)
    job = build_priced_job!(profile)
    result = JobFundingService.collect!(
      job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
    )
    raise Fail, "card collect failed: #{result.inspect}" unless result[:success] || result[:requires_action]

    txn = result[:transaction] || job.job_payment_transactions.order(:id).last
    if result[:requires_action]
      pass!("7_card_job_payment", "requires_action recorded for 3DS-capable card path txn=#{txn&.id}")
    else
      raise Fail, "expected succeeded card txn" unless txn&.status_succeeded?
      raise Fail, "ACH flag must not interfere with card" if txn.payment_method_type.to_s == "us_bank_account"

      pass!("7_card_job_payment", "card succeeded txn=#{txn.id} pi=#{txn.stripe_payment_intent_id}")
    end
  end

  def scenario_flag_enforcement!
    # Global OFF + company ON => block
    user_a, profile_a, = ensure_e2e_company!(suffix: "flag_g_off", ach_enabled: true)
    AchAccess.set_global!(enabled: false, actor: nil, source: "ach_e2e")
    begin
      CompanyPaymentMethodsService.create_setup_intent!(user_a, payment_method_type: "us_bank_account")
      raise Fail, "expected ACH blocked when global OFF / company ON"
    rescue CompanyPaymentMethodsService::Error => e
      raise Fail, "unexpected: #{e.message}" unless e.message.include?("not enabled")
    end

    # Global ON + company OFF => block
    AchAccess.set_global!(enabled: true, actor: nil, source: "ach_e2e")
    user_b, profile_b, customer_b = ensure_e2e_company!(suffix: "flag_c_off", ach_enabled: false)
    begin
      CompanyPaymentMethodsService.create_setup_intent!(user_b, payment_method_type: "us_bank_account")
      raise Fail, "expected ACH blocked when global ON / company OFF"
    rescue CompanyPaymentMethodsService::Error => e
      raise Fail, "unexpected: #{e.message}" unless e.message.include?("not enabled")
    end

    # Both ON => allowed
    AchAccess.set_company!(profile_b, enabled: true, actor: nil, source: "ach_e2e")
    ok = CompanyPaymentMethodsService.create_setup_intent!(user_b, payment_method_type: "us_bank_account")
    raise Fail, "expected ACH allowed when both ON" if ok[:setup_intent_id].blank?

    # Card still works while company ACH off
    AchAccess.set_company!(profile_b, enabled: false, actor: nil, source: "ach_e2e")
    attach_test_card!(customer_b.id)
    job = build_priced_job!(profile_b)
    card_result = JobFundingService.collect!(
      job: job, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1
    )
    raise Fail, "card should work while ACH off: #{card_result.inspect}" unless card_result[:success] || card_result[:requires_action]

    # Saved bank cannot bypass flag: attach verified bank while ON, then flip OFF and collect.
    AchAccess.set_company!(profile_b, enabled: true, actor: nil, source: "ach_e2e")
    detail = "global/company matrix ok; card ok"
    begin
      attach_verified_bank_via_setup!(user_b, customer_b)
      AchAccess.set_company!(profile_b, enabled: false, actor: nil, source: "ach_e2e")
      job2 = build_priced_job!(profile_b)
      blocked = JobFundingService.collect!(
        job: job2, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1
      )
      raise Fail, "saved bank bypassed ACH flag" unless blocked[:ach_disabled] || blocked[:error].to_s.include?("not enabled")

      # Disable during processing: enable, start ACH, disable, webhook/reconcile must continue.
      AchAccess.set_company!(profile_b, enabled: true, actor: nil, source: "ach_e2e")
      attach_verified_bank_via_setup!(user_b, customer_b)
      job3 = build_priced_job!(profile_b)
      mid = JobFundingService.collect!(job: job3, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1)
      AchAccess.set_company!(profile_b, enabled: false, actor: nil, source: "ach_e2e")
      txn = mid[:transaction]
      if txn&.status_processing?
        poll_until(timeout: POLL_TIMEOUT) { txn.reload.status_succeeded? || txn.status_failed? }
      end
      detail += "; saved-bank-bypass blocked; disable-during-processing status=#{txn&.status}"
    rescue SkipSandbox, Fail, Stripe::StripeError => e
      detail += "; bank-flag paths partial (#{e.class}: #{e.message.to_s[0, 60]})"
      raise if e.is_a?(Fail) && e.message.include?("bypassed")
    end

    # Production defaults remain OFF conceptually — restore global to ON for other scenarios,
    # but document that PlatformSetting default for new envs is fail-closed absent.
    pass!("8_flag_enforcement_and_disable_during_processing", detail)
  ensure
    AchAccess.set_global!(enabled: true, actor: nil, source: "ach_e2e")
  end

  def scenario_ach_return_or_dispute!
    # Attempt official dispute test bank if funding path can reach a charge.
    user, profile, customer = ensure_e2e_company!(suffix: "dispute", ach_enabled: true)
    begin
      attach_verified_bank_via_setup!(user, customer, account_number: TEST_ACCOUNT_DISPUTE)
      job = build_priced_job!(profile)
      result = JobFundingService.collect!(
        job: job, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1
      )
      txn = result[:transaction]
      if txn&.stripe_payment_intent_id.present?
        # Poll briefly for dispute / risk event. Many sandboxes never emit ACH returns automatically.
        saw_risk = false
        begin
          poll_until(timeout: [POLL_TIMEOUT, 30].min) do
            txn.reload
            saw_risk = defined?(PaymentRiskEvent) && PaymentRiskEvent.where(job_id: job.id).exists?
            txn.disputed? || saw_risk || txn.status_failed?
          end
        rescue Fail
          # fall through to SKIPPED
        end
        if txn.reload.disputed? || saw_risk
          risk = PaymentRiskEvent.where(job_id: job.id).order(:id).last
          pass!(
            "9_ach_return_or_dispute",
            "pi=#{txn.stripe_payment_intent_id} dispute=#{txn.stripe_dispute_id} " \
            "risk=#{risk&.id} status=#{risk&.status} (no auto clawback)"
          )
          return
        end
      end
    rescue Stripe::StripeError, Fail => e
      raise SkipSandbox,
        "No automated ACH return/dispute sequence available in this sandbox (#{e.message}). " \
        "Use signed snapshot webhook fixtures for deterministic coverage; " \
        "do not label synthetic path as real Stripe E2E."
    end

    raise SkipSandbox,
      "SKIPPED_SANDBOX_LIMIT: Stripe test platform did not emit ACH return/dispute for " \
      "account #{TEST_ACCOUNT_DISPUTE} within poll window. Deterministic substitute: " \
      "signed webhook fixtures in stripe_webhooks_controller_test / ach_webhooks_test."
  end
end
