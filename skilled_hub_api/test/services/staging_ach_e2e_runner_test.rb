# frozen_string_literal: true

require "test_helper"

# Regression coverage for defects found in the first real staging Stripe test-mode run.
# These tests do NOT call live Stripe — they prove schema/query contracts the runner relies on.
class StagingAchE2eRunnerTest < ActiveSupport::TestCase
  setup do
    require Rails.root.join("lib/staging_ach_e2e_runner")
  end

  test "job_payment_transactions does not have failed_at (runner-only bug root cause)" do
    refute_includes JobPaymentTransaction.column_names, "failed_at",
      "job_payment_transactions.failed_at must not exist — failures use status enum"
  end

  test "stripe_setup_records owns failed_at for setup audit" do
    assert_includes StripeSetupRecord.column_names, "failed_at"
    assert_includes StripeSetupRecord.column_names, "succeeded_at"
  end

  test "assert_job_payment_schema! passes against current schema" do
    assert StagingAchE2eRunner.assert_job_payment_schema!
  end

  test "webhook-affected relation SQL never references failed_at" do
    rel = StagingAchE2eRunner.job_payment_webhook_affected_relation
    sql = rel.to_sql
    refute_match(/\bfailed_at\b/, sql)
    assert_match(/succeeded_at|processing_at|status/, sql)

    # Execute against the real adapter so PG would raise UndefinedColumn if drifted.
    assert_nothing_raised { rel.limit(1).to_a }
  end

  test "querying job_payment_transactions.failed_at raises (documents original staging failure)" do
    error = assert_raises(ActiveRecord::StatementInvalid) do
      JobPaymentTransaction.where("failed_at IS NOT NULL").limit(1).to_a
    end
    assert_match(/failed_at|no such column|UndefinedColumn|PG::/i, error.message)
  end

  test "failed job payment rows are selected via status not failed_at" do
    company = User.create!(
      email: "e2e-schema-#{SecureRandom.hex(3)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    profile = CompanyProfile.create!(user: company, membership_level: "basic")
    company.update_column(:company_profile_id, profile.id)
    job = Job.create!(
      company_profile: profile,
      title: "schema",
      description: "d",
      status: :pending_funding,
      funding_status: :funding_failed,
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
      amount_cents: 1000,
      currency: "usd",
      status: :failed,
      stripe_payment_intent_id: "pi_e2e_schema_fail",
      idempotency_key: "tf_e2e_schema_#{SecureRandom.hex(4)}",
      revision: 1,
      error_message: "insufficient funds"
    )

    found = StagingAchE2eRunner.job_payment_webhook_affected_relation.find_by(id: txn.id)
    assert_equal txn.id, found.id
  end

  test "runner source does not attach unverified raw bank PaymentMethods" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    refute_match(
      /PaymentMethod\.attach\(\s*["']pm_usBankAccount_/,
      source,
      "must not attach unverified pm_usBankAccount_* tokens"
    )
    refute_match(
      /def attach_test_bank!/,
      source,
      "legacy attach_test_bank! path must remain removed"
    )
    assert_match(/SetupIntent\.confirm/, source)
    assert_match(/mandate_data/, source)
    assert_match(/verify_microdeposits/, source)
    # mandate_data must not appear on SetupIntent.create in runner helpers that mirror app create
    create_blocks = source.scan(/SetupIntent\.create[\s\S]{0,400}/)
    create_blocks.each do |block|
      refute_match(/mandate_data/, block, "mandate_data must not be on SetupIntent.create")
    end
  end

  test "runner never uses invalid verification_method skip" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    refute_match(/verification_mode:\s*:skip/, source)
    refute_match(/verification_method:\s*["']skip["']/, source)
    assert_includes StagingAchE2eRunner::VALID_VERIFICATION_METHODS, "automatic"
    assert_includes StagingAchE2eRunner::VALID_VERIFICATION_METHODS, "microdeposits"
    refute_includes StagingAchE2eRunner::VALID_VERIFICATION_METHODS, "skip"
  end

  test "runner uses pending_funding? not status_pending_funding?" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    code_only = source.lines.reject { |l| l.match?(/^\s*#/) }.join
    refute_match(/status_pending_funding\?/, code_only)
    assert_match(/\.pending_funding\?/, code_only)
    # App Job enum has no status_ prefix on status — confirm real API.
    job = Job.new(status: :pending_funding)
    assert_respond_to job, :pending_funding?
    refute_respond_to job, :status_pending_funding?
  end

  test "bank_account_status tolerates empty Stripe status_details" do
    bank = Stripe::StripeObject.construct_from(
      bank_name: "STRIPE TEST BANK",
      last4: "6789",
      status_details: {},
      networks: {}
    )
    status = CompanyPaymentMethodsService.send(:bank_account_status, bank)
    assert_equal "verified", status

    blocked_bank = Stripe::StripeObject.construct_from(
      status_details: { "blocked" => { "reason" => "bank_account_restricted" } },
      networks: {}
    )
    assert_equal "blocked", CompanyPaymentMethodsService.send(:bank_account_status, blocked_bank)
  end

  test "webhook_event_for_payment_intent correlates exact pi payload" do
    pi = "pi_e2e_correlate_#{SecureRandom.hex(4)}"
    StripeWebhookEvent.create!(
      stripe_event_id: "evt_unrelated_#{SecureRandom.hex(4)}",
      event_type: "payment_intent.succeeded",
      payload: { id: "pi_other" }.to_json,
      processed_at: Time.current
    )
    matched = StripeWebhookEvent.create!(
      stripe_event_id: "evt_matched_#{SecureRandom.hex(4)}",
      event_type: "payment_intent.succeeded",
      payload: { id: pi, object: "payment_intent" }.to_json,
      processed_at: Time.current
    )
    found = StagingAchE2eRunner.webhook_event_for_payment_intent(pi).first
    assert_equal matched.id, found.id
    assert_nil StagingAchE2eRunner.webhook_event_for_payment_intent("pi_missing_zzz").first
  end

  test "Connect detection does not short-circuit with || true" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    refute_match(/\|\|\s*true/, source)
    assert_match(/Account\.create/, source)
    assert_match(/BLOCKED/, source)
    assert_match(/verify_connect_platform!/, source)
  end

  test "production ACH defaults remain fail-closed" do
    PlatformSetting.where(key: AchAccess::GLOBAL_SETTING_KEY).delete_all
    refute AchAccess.global_enabled_without_env_kill
    refute AchAccess.global_enabled?
  end

  test "seeds.rb is loadable and declares idempotent ACH flag re-assert" do
    source = File.read(Rails.root.join("db/seeds.rb"))
    assert_match(/seed_ach_flags!/, source)
    assert_match(/JobPaymentTransaction/, source)
    assert_match(/find_or_initialize_by|seed_or_find_user!/, source)
    assert_match(/Idempotent re-seed|SEED_IDEMPOTENT/, source)
  end

  test "runner connect fixture sets technician phone and does not call PaymentRiskEvent#status" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    code_only = source.lines.reject { |l| l.match?(/^\s*#/) }.join
    assert_match(/phone:\s*["']713-555-0198["']/, code_only)
    refute_match(/risk&\.status\b|risk\.status\b/, code_only)
    assert_match(/investigation_status/, code_only)
    assert_match(/ensure_transfers_capability_active!/, code_only)
    assert_match(/cleanup_connect_probe_accounts!/, code_only)
    assert_includes PaymentRiskEvent.column_names, "investigation_status"
    refute_includes PaymentRiskEvent.column_names, "status"
  end

  test "runner creates Connect accounts with controller requirement_collection application" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    code_only = source.lines.reject { |l| l.match?(/^\s*#/) }.join
    assert_match(/requirement_collection:\s*["']application["']/, code_only)
    assert_match(/fees:\s*\{\s*payer:\s*["']application["']/, code_only)
    assert_match(/losses:\s*\{\s*payments:\s*["']application["']/, code_only)
    assert_match(/stripe_dashboard:\s*\{\s*type:\s*["']none["']/, code_only)
    assert_match(/STAGING_E2E_CONNECT_ACCOUNT_ID/, code_only)
    assert_match(/reuse_env_connect_account!/, code_only)
    assert_match(/@protected_accounts/, code_only)
    assert_match(/safe_stripe_livemode/, code_only)
    assert_match(/assert_test_mode_via_platform!/, code_only)
    assert_match(/skipped controller-account create|skipped controller create/, code_only)
    assert_equal "acct_1T9R18Rsck7C7qtp", StagingAchE2eRunner::EXPECTED_PLATFORM_ID
    # Must not fall back to Express create + tos_acceptance in the runner create path.
    refute_match(/type:\s*["']express["'][\s\S]{0,400}tos_acceptance:/, code_only)
    # Connected accounts must not be probed with bare .livemode (NoMethodError in Stripe ruby).
    refute_match(/acct\.livemode\b/, code_only)
  end

  test "runner R6 fully funds via company_required_cents and prints full transfer errors" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    connect = source[/def scenario_connect_transfer!.*?^  end$/m]
    refute_nil connect
    code_only = connect.lines.reject { |l| l.match?(/^\s*#/) }.join
    assert_match(/company_required_cents/, code_only)
    assert_match(/fully_funded/, code_only)
    # Transfer FAIL / pass detail must not truncate Stripe / PaymentService errors.
    refute_match(/\[:error\]\.to_s\[0,\s*\d+\]/, code_only)
    refute_match(/ops\.error\.to_s\[0,\s*\d+\]/, code_only)
    assert_match(/transfer failed via PaymentService \(\#\{result\[:error\]\}\)/, code_only)
  end

  test "staging connect_onboarding_link rake task is defined" do
    rake = File.read(Rails.root.join("lib/tasks/staging_ach_e2e.rake"))
    assert_match(/task connect_onboarding_link/, rake)
    assert_match(/AccountLink\.create/, rake)
    assert_match(/type:\s*["']express["']/, rake)
    assert_match(/STAGING_E2E_CONNECT_ACCOUNT_ID/, rake)
    # Express onboarding link path must not attest ToS on behalf of the account.
    express_block = rake[/task connect_onboarding_link.*?end\nend/m]
    refute_nil express_block
    code_only = express_block.lines.reject { |l| l.match?(/^\s*#/) }.join
    refute_match(/tos_acceptance/, code_only)
  end
end
