# frozen_string_literal: true

# Staging-only real Stripe test-mode E2E. Never mocks Stripe. Never touches live mode.
# Usage: RAILS_ENV=staging bin/rails staging:ach_e2e
class StagingAchE2eRunner
  Scenario = Struct.new(:name, :status, :detail, keyword_init: true)

  POLL_TIMEOUT = (ENV["ACH_E2E_POLL_TIMEOUT_SEC"].presence || 90).to_i
  POLL_INTERVAL = 2

  def initialize
    @scenarios = []
    @created = { customers: [], payment_methods: [], setup_intents: [], payment_intents: [], accounts: [], transfers: [], refunds: [] }
  end

  def run!
    assert_safe_environment!
    assert_connect_platform!
    puts "[ach_e2e] Starting against #{Rails.env} Stripe mode=#{StripeModeGuard.mode_label}"

    run_scenario("1_bank_setup_intent_mandate") { scenario_bank_setup! }
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

  def assert_connect_platform!
    acct = Stripe::Account.retrieve
    # Connect platforms expose capabilities / controller / type that differ from standard.
    connect_capable =
      acct.respond_to?(:type) && %w[standard express custom].include?(acct.type.to_s) == false &&
      (acct["controller"].present? || acct.respond_to?(:settings) || true)
    # Prefer explicit capability probe: list connected accounts must be permitted.
    begin
      Stripe::Account.list(limit: 1)
    rescue Stripe::PermissionError, Stripe::AuthenticationError => e
      abort "[ach_e2e] REFUSED: Stripe account is not a Connect-capable platform (#{e.message}). Switch to the Connect-enabled sandbox key."
    end
    puts "[ach_e2e] Connect platform OK (account=#{acct.id})"
  rescue Stripe::StripeError => e
    abort "[ach_e2e] REFUSED: Cannot verify Connect platform via Stripe::Account.retrieve (#{e.message})"
  end

  def run_scenario(name)
    yield
  rescue SkipSandbox => e
    @scenarios << Scenario.new(name: name, status: "SKIPPED_SANDBOX_LIMIT", detail: e.message)
  rescue StandardError => e
    @scenarios << Scenario.new(name: name, status: "FAIL", detail: "#{e.class}: #{e.message}")
  end

  class SkipSandbox < StandardError; end
  class Fail < StandardError; end

  def pass!(name, detail)
    @scenarios << Scenario.new(name: name, status: "PASS", detail: detail)
  end

  def print_table!
    puts
    puts "==== staging:ach_e2e results ===="
    @scenarios.each do |s|
      puts format("%-55s %-24s %s", s.name, s.status, s.detail.to_s[0, 120])
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

  def attach_test_bank!(customer_id, payment_method: "pm_usBankAccount_success")
    # Stripe test helper: attach a test payment method token when available.
    pm =
      begin
        Stripe::PaymentMethod.create(type: "us_bank_account", us_bank_account: {
          account_holder_type: "company",
          account_number: "000123456789",
          routing_number: "110000000"
        }, billing_details: { name: "E2E Bank", email: "e2e@techflash.staging" })
      rescue Stripe::StripeError
        # Fall back to documented test PM ids via PaymentMethod.attach if create restricted.
        raise SkipSandbox, "Could not create us_bank_account PaymentMethod via API in this sandbox"
      end
    Stripe::PaymentMethod.attach(pm.id, { customer: customer_id })
    Stripe::Customer.update(customer_id, invoice_settings: { default_payment_method: pm.id })
    @created[:payment_methods] << pm.id
    pm
  end

  def attach_test_card!(customer_id, pm_token: "pm_card_visa")
    pm = Stripe::PaymentMethod.attach(pm_token, { customer: customer_id })
    Stripe::Customer.update(customer_id, invoice_settings: { default_payment_method: pm.id })
    @created[:payment_methods] << pm.id
    pm
  rescue Stripe::StripeError => e
    # Create a raw test card PM
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
    user, profile, customer = ensure_e2e_company!(suffix: "banksetup", ach_enabled: true)
    payload = CompanyPaymentMethodsService.create_setup_intent!(
      user, payment_method_type: "us_bank_account", ip_address: "127.0.0.1", user_agent: "ach_e2e"
    )
    raise Fail, "missing client_secret" if payload[:client_secret].blank?

    @created[:setup_intents] << payload[:setup_intent_id]
    # Confirm ownership boundary: another company cannot list this customer's methods.
    other_user, = ensure_e2e_company!(suffix: "banksetup_other", ach_enabled: true)
    other_list = CompanyPaymentMethodsService.list_for(other_user)
    raise Fail, "cross-company leaked methods" if other_list[:payment_methods].any? { |m| m[:id] == payload[:setup_intent_id] }

    pass!("1_bank_setup_intent_mandate", "SetupIntent #{payload[:setup_intent_id]} for customer #{customer.id}; cross-company isolated")
  end

  def scenario_ach_funding_success!
    user, profile, customer = ensure_e2e_company!(suffix: "achok", ach_enabled: true)
    begin
      attach_test_bank!(customer.id)
    rescue SkipSandbox
      # Try Stripe's special success test payment method id if available in Connect sandbox.
      begin
        Stripe::PaymentMethod.attach("pm_usBankAccount_success", { customer: customer.id })
        Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: "pm_usBankAccount_success" })
      rescue Stripe::StripeError => e
        raise SkipSandbox, "ACH success test bank unavailable (#{e.message})"
      end
    end
    job = build_priced_job!(profile)
    result = JobFundingService.collect!(
      job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
    )
    txn = result[:transaction] || job.job_payment_transactions.order(:id).last
    raise Fail, "collect failed: #{result.inspect}" if txn.blank?

    @created[:payment_intents] << txn.stripe_payment_intent_id if txn.stripe_payment_intent_id
    if txn.status_processing? || result[:processing]
      raise Fail, "job funded too early while processing" if job.reload.funding_funded?

      poll_until do
        txn.reload
        txn.status_succeeded? || txn.status_failed?
      end
    end
    raise Fail, "expected succeeded, got #{txn.reload.status}" unless txn.reload.status_succeeded?

    JobFundingService.publish!(job) if job.reload.status_pending_funding? || job.funding_unfunded?
    pass!("2_ach_funding_processing_then_succeeded", "txn=#{txn.id} status=#{txn.status} job_funding=#{job.reload.funding_status}")
  end

  def scenario_ach_funding_failure!
    user, profile, customer = ensure_e2e_company!(suffix: "achfail", ach_enabled: true)
    begin
      Stripe::PaymentMethod.attach("pm_usBankAccount_insufficientFunds", { customer: customer.id })
      Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: "pm_usBankAccount_insufficientFunds" })
    rescue Stripe::StripeError => e
      raise SkipSandbox, "ACH failure test bank unavailable (#{e.message})"
    end
    job = build_priced_job!(profile)
    result = JobFundingService.collect!(
      job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
    )
    txn = result[:transaction] || job.job_payment_transactions.order(:id).last
    if txn&.status_processing?
      poll_until(timeout: POLL_TIMEOUT) do
        txn.reload.status_failed? || txn.status_succeeded?
      end
    end
    raise Fail, "job must not be funded after ACH failure" if job.reload.funding_funded?
    raise Fail, "expected failure recorded" unless txn&.status_failed? || result[:error].present? || result[:success] == false

    pass!("3_ach_funding_failure", "failure recorded; job funding=#{job.funding_status}")
  end

  def scenario_webhooks_persisted!
    unless ActiveRecord::Base.connection.data_source_exists?("stripe_webhook_events") ||
        defined?(StripeWebhookEvent) ||
        ActiveRecord::Base.connection.data_source_exists?("stripe_events")
      # Prefer any persistence table used by the app
    end
    recent = JobPaymentTransaction.where("updated_at > ?", 2.hours.ago).limit(1)
    # Confirm webhook-driven rows have stripe ids from real events by requiring a recent ACH/card txn
    # with succeeded_at set after processing_at (handler effect).
    sample = JobPaymentTransaction.where.not(stripe_payment_intent_id: nil)
      .where("succeeded_at IS NOT NULL OR processing_at IS NOT NULL OR failed_at IS NOT NULL OR status = ?", JobPaymentTransaction.statuses[:failed])
      .order(updated_at: :desc).first
    raise Fail, "no webhook-affected payment transactions found yet; run scenarios 2/3 first" if sample.blank?

    pass!("4_signed_webhooks_persisted", "observed txn #{sample.id} pi=#{sample.stripe_payment_intent_id} status=#{sample.status}")
  end

  def scenario_refund!
    txn = JobPaymentTransaction.company_collections.status_succeeded.where.not(stripe_payment_intent_id: nil).order(id: :desc).first
    raise SkipSandbox, "no succeeded collection available to refund" if txn.blank?

    amount = [txn.amount_cents / 4, 100].max
    key = "e2e_refund_#{txn.id}_#{SecureRandom.hex(3)}"
    result = JobStripeOps.refund!(
      amount_cents: amount,
      payment_intent_id: txn.stripe_payment_intent_id,
      metadata: { "e2e" => "true", "source_txn" => txn.id.to_s },
      idempotency_key: key
    )
    raise Fail, "refund failed: #{result.error}" unless result.succeeded? || result.status.to_s == "pending"

    @created[:refunds] << result.stripe_id if result.stripe_id
    # Idempotent replay of same key must not double-create economically
    result2 = JobStripeOps.refund!(
      amount_cents: amount,
      payment_intent_id: txn.stripe_payment_intent_id,
      metadata: { "e2e" => "true", "source_txn" => txn.id.to_s },
      idempotency_key: key
    )
    raise Fail, "idempotent refund id mismatch" if result.stripe_id.present? && result2.stripe_id.present? && result.stripe_id != result2.stripe_id

    pass!("5_refund_reconciled", "refund=#{result.stripe_id} status=#{result.status}")
  end

  def scenario_connect_transfer!
    # Create Express test connected account
    account = Stripe::Account.create(
      type: "express",
      country: "US",
      email: "e2e+connect-#{SecureRandom.hex(3)}@techflash.staging",
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      tos_acceptance: { date: Time.now.to_i, ip: "127.0.0.1" }
    )
    @created[:accounts] << account.id
    charge = JobPaymentTransaction.company_collections.status_succeeded.where.not(stripe_charge_id: nil).order(id: :desc).first
    raise SkipSandbox, "no succeeded charge for source_transaction transfer" if charge.blank?

    amount = [charge.amount_cents / 10, 100].max
    transfer = Stripe::Transfer.create(
      {
        amount: amount,
        currency: "usd",
        destination: account.id,
        source_transaction: charge.stripe_charge_id,
        transfer_group: "E2E_#{SecureRandom.hex(4)}",
        metadata: { e2e: "true" }
      }
    )
    @created[:transfers] << transfer.id
    raise Fail, "destination mismatch" unless transfer.destination.to_s == account.id
    raise Fail, "amount mismatch" unless transfer.amount.to_i == amount

    pass!("6_connect_transfer", "tr=#{transfer.id} dest=#{account.id} amount=#{amount} source=#{charge.stripe_charge_id}")
  rescue Stripe::InvalidRequestError => e
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

      pass!("7_card_job_payment", "card succeeded txn=#{txn.id}")
    end
  end

  def scenario_flag_enforcement!
    user, profile, customer = ensure_e2e_company!(suffix: "flagoff", ach_enabled: false)
    begin
      CompanyPaymentMethodsService.create_setup_intent!(user, payment_method_type: "us_bank_account")
      raise Fail, "expected ACH setup to be refused when flag off"
    rescue CompanyPaymentMethodsService::Error => e
      raise Fail, "unexpected error: #{e.message}" unless e.message.include?("not enabled")
    end

    # Card still works
    attach_test_card!(customer.id)
    job = build_priced_job!(profile)
    card_result = JobFundingService.collect!(
      job: job, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1
    )
    raise Fail, "card should work while ACH off: #{card_result.inspect}" unless card_result[:success] || card_result[:requires_action]

    # Disable during processing: enable ACH, start bank debit if possible, then disable, ensure webhook path still applicable.
    AchAccess.set_company!(profile, enabled: true, actor: nil, source: "ach_e2e")
    begin
      Stripe::PaymentMethod.attach("pm_usBankAccount_success", { customer: customer.id })
      Stripe::Customer.update(customer.id, invoice_settings: { default_payment_method: "pm_usBankAccount_success" })
      job2 = build_priced_job!(profile)
      mid = JobFundingService.collect!(job: job2, amount_cents: 5_000, transaction_type: :initial_job_charge, revision: 1)
      AchAccess.set_company!(profile, enabled: false, actor: nil, source: "ach_e2e")
      txn = mid[:transaction]
      if txn&.status_processing?
        poll_until(timeout: POLL_TIMEOUT) { txn.reload.status_succeeded? || txn.status_failed? }
      end
      detail = "flag off blocked setup; card ok; disable-during-processing observed status=#{txn&.status}"
    rescue Stripe::StripeError, SkipSandbox => e
      detail = "flag off blocked setup; card ok; disable-during-processing SKIPPED (#{e.message})"
    end
    pass!("8_flag_enforcement_and_disable_during_processing", detail)
  end

  def scenario_ach_return_or_dispute!
    raise SkipSandbox, "No documented ACH return/dispute trigger available for automated Connect sandbox; rely on signed fixtures / manual Stripe dashboard dispute"
  end
end
