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
end
