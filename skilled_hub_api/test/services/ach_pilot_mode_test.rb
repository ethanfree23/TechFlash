# frozen_string_literal: true

require "test_helper"
require "ostruct"

# Server-side ACH pilot gating (AchAccess.allowed? is the single decision used by every
# NEW ACH initiation route: bank linking / SetupIntent, saved-method selection, job funding,
# top-ups, internal smoke test). Webhook/refund/dispute/reconciliation paths stay ungated.
class AchPilotModeTest < ActiveSupport::TestCase
  ELIGIBLE_COMPANY_COUNT = 17

  setup do
    PlatformSetting.where(key: [AchAccess::GLOBAL_SETTING_KEY, AchAccess::PILOT_SETTING_KEY]).delete_all
    ENV.delete("ACH_GLOBAL_DISABLED")
    @admin = User.create!(
      email: "ach-pilot-admin-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :admin
    )
    @eligible = Array.new(ELIGIBLE_COMPANY_COUNT) { |i| make_company(name: "Eligible #{i + 1}") }
    @pilot = @eligible.first
    @blocked = make_company(name: "Admin Blocked Co")
    AchAccess.set_company!(@blocked, enabled: false, actor: @admin, source: "admin")
    @blocked.reload
  end

  teardown do
    ENV.delete("ACH_GLOBAL_DISABLED")
  end

  def make_company(name:)
    user = User.create!(
      email: "ach-pilot-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company,
      stripe_customer_id: "cus_#{SecureRandom.hex(4)}"
    )
    cp = CompanyProfile.create!(user: user, membership_level: "basic", company_name: name, phone: "713-555-3000")
    user.update_column(:company_profile_id, cp.id)
    cp
  end

  def enable_pilot!(ids)
    AchAccess.set_pilot!(enabled: true, company_profile_ids: ids, actor: @admin, source: "admin")
  end

  # ---- default state -------------------------------------------------------------

  test "pilot setting absent => pilot OFF; global ON permits all 17 eligible companies and denies explicit blocks" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    refute AchAccess.pilot_mode_enabled?
    @eligible.each { |cp| assert AchAccess.allowed?(cp), "eligible company #{cp.id} should be allowed" }
    refute AchAccess.allowed?(@blocked)
    assert_equal :company_blocked, AchAccess.denial_reason(@blocked)
  end

  test "new company default (column default true) is allowed with pilot OFF and denied with pilot ON" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    newcomer = make_company(name: "Brand New Co")
    assert_equal true, newcomer.ach_payments_enabled
    assert AchAccess.allowed?(newcomer)

    enable_pilot!([@pilot.id])
    refute AchAccess.allowed?(newcomer)
    assert_equal :pilot_restricted, AchAccess.denial_reason(newcomer)
  end

  # ---- pilot ON ------------------------------------------------------------------

  test "global ON + pilot ON permits ONLY the designated company; the other 16 eligible companies are denied" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])

    assert AchAccess.allowed?(@pilot)
    assert AchAccess.assert_allowed!(@pilot)
    (@eligible - [@pilot]).each do |cp|
      assert cp.ach_payments_enabled, "company flag is still true (not an admin block)"
      refute AchAccess.allowed?(cp), "company #{cp.id} must be denied under pilot"
      err = assert_raises(AchAccess::DisabledError) { AchAccess.assert_allowed!(cp) }
      assert_equal "ach_pilot_restricted", err.code
      assert_equal AchAccess::PILOT_USER_SAFE_MESSAGE, err.message
    end
    refute AchAccess.allowed?(@blocked)
    assert_equal :company_blocked, AchAccess.denial_reason(@blocked), "explicit block reported before pilot"
  end

  test "pilot ON does not override an explicit admin block on the pilot company itself" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    AchAccess.set_company!(@pilot, enabled: false, actor: @admin, source: "admin")
    refute AchAccess.allowed?(@pilot.reload)
  end

  test "pilot ON with global OFF denies everyone, including the pilot company" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    enable_pilot!([@pilot.id])
    refute AchAccess.allowed?(@pilot)
    assert_equal :global_disabled, AchAccess.denial_reason(@pilot)
    @eligible.each { |cp| refute AchAccess.allowed?(cp) }
  end

  test "ENV kill switch denies everyone regardless of pilot" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    ENV["ACH_GLOBAL_DISABLED"] = "true"
    refute AchAccess.allowed?(@pilot)
    assert_equal :env_kill_switch, AchAccess.denial_reason(@pilot)
    @eligible.each { |cp| refute AchAccess.allowed?(cp) }
  end

  test "global DB OFF (no pilot) denies all 17 eligible companies" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    @eligible.each { |cp| refute AchAccess.allowed?(cp) }
    refute AchAccess.allowed?(@blocked)
  end

  # ---- fail closed ----------------------------------------------------------------

  test "set_pilot! refuses to enable without a valid company" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    assert_raises(ArgumentError) { AchAccess.set_pilot!(enabled: true, company_profile_ids: [], actor: @admin) }
    assert_raises(ArgumentError) { AchAccess.set_pilot!(enabled: true, company_profile_ids: nil, actor: @admin) }
    assert_raises(ArgumentError) { AchAccess.set_pilot!(enabled: true, company_profile_ids: [999_999], actor: @admin) }
    refute AchAccess.pilot_mode_enabled?
    @eligible.each { |cp| assert AchAccess.allowed?(cp) }
  end

  test "pilot ON persisted with no valid company (tampered or deleted company) denies everyone" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    PlatformSetting.create!(key: AchAccess::PILOT_SETTING_KEY, value_json: { "enabled" => true, "company_profile_ids" => [] })
    assert AchAccess.pilot_misconfigured?
    @eligible.each { |cp| refute AchAccess.allowed?(cp) }

    PlatformSetting.find_by!(key: AchAccess::PILOT_SETTING_KEY)
                   .update!(value_json: { "enabled" => true, "company_profile_ids" => [999_999] })
    assert AchAccess.pilot_misconfigured?
    @eligible.each { |cp| refute AchAccess.allowed?(cp) }
    assert_equal true, AchAccess.pilot_status[:misconfigured]
  end

  test "pilot ON with a malformed value (string, non-hash) is treated as a closed pilot" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    PlatformSetting.create!(key: AchAccess::PILOT_SETTING_KEY, value_json: { "enabled" => "true", "company_profile_ids" => "19" })
    # "true" casts to enabled; "19" is coerced to a single id that may not exist here => closed.
    assert AchAccess.pilot_mode_enabled?
    refute AchAccess.allowed?(@eligible.last) unless @eligible.last.id == 19
  end

  # ---- audit + persistence -------------------------------------------------------

  test "set_pilot! persists without deploy and writes an audit row with old/new company ids" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    status = enable_pilot!([@pilot.id])
    assert_equal true, status[:ach_pilot_mode_enabled]
    assert_equal [@pilot.id], status[:valid_company_profile_ids]
    assert_equal false, status[:misconfigured]

    setting = PlatformSetting.find_by!(key: AchAccess::PILOT_SETTING_KEY)
    assert_equal({ "enabled" => true, "company_profile_ids" => [@pilot.id] }, setting.value_json)

    audit = AchFeatureAudit.where(scope: "pilot").order(:id).last
    assert_equal true, audit.new_value
    assert_equal false, audit.old_value
    assert_equal @admin.id, audit.actor_user_id
    assert_equal [], audit.metadata_json["old_company_profile_ids"]
    assert_equal [@pilot.id], audit.metadata_json["new_company_profile_ids"]

    AchAccess.set_pilot!(enabled: false, actor: @admin, source: "admin")
    refute AchAccess.pilot_mode_enabled?
    @eligible.each { |cp| assert AchAccess.allowed?(cp) }
    assert_equal 2, AchFeatureAudit.where(scope: "pilot").count
  end

  test "status_for exposes pilot fields" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    s = AchAccess.status_for(@eligible.last)
    assert_equal true, s[:ach_pilot_mode_enabled]
    assert_equal false, s[:ach_pilot_permits_company]
    assert_equal false, s[:ach_payments_enabled]
    assert_equal true, AchAccess.status_for(@pilot)[:ach_payments_enabled]
  end

  # ---- same decision on every initiation route -----------------------------------

  test "bank linking (SetupIntent) is refused for a non-pilot company and permitted for the pilot company" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    other = @eligible.last

    err = assert_raises(CompanyPaymentMethodsService::Error) do
      CompanyPaymentMethodsService.create_setup_intent!(other.user, payment_method_type: "us_bank_account")
    end
    assert_equal AchAccess::PILOT_USER_SAFE_MESSAGE, err.message

    created = false
    StripeCustomerService.stub(:ensure_customer_id!, @pilot.user.stripe_customer_id) do
      Stripe::SetupIntent.stub(:create, ->(*_a) { created = true; OpenStruct.new(id: "seti_pilot", client_secret: "secret", status: "requires_payment_method") }) do
        CompanyPaymentMethodsService.create_setup_intent!(@pilot.user, payment_method_type: "us_bank_account")
      end
    end
    assert created
  end

  test "job funding with a saved bank PM is refused for a non-pilot company (no PaymentIntent create)" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    other = @eligible.last
    job = Job.create!(
      company_profile: other, title: "pilot gate job", description: "d", status: :pending_funding,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1
    )
    JobFundingService.ensure_header!(job)
    creates = 0
    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeCustomerService.stub(:validate_or_clear_customer_id!, other.user.stripe_customer_id) do
        JobFundingService.stub(:default_payment_method_id, "pm_bank_saved") do
          JobFundingService.stub(:payment_method_type_for, "us_bank_account") do
            JobStripeOps.stub(:create_payment_intent!, ->(**_k) { creates += 1; raise "must not create" }) do
              result = JobFundingService.collect!(job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1)
              assert result[:ach_disabled]
              refute result[:success]
            end
          end
        end
      end
    end
    assert_equal 0, creates
    assert_equal 0, job.job_payment_transactions.where.not(status: :pending).count
  end

  test "internal smoke test execution is refused for a non-pilot company under pilot mode" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    other = @eligible.last
    ENV["INTERNAL_SMOKE_TEST_COMPANY_PROFILE_ID"] = other.id.to_s
    test_row = InternalFinancialSmokeTestService.authorize!(
      company_profile_id: other.id, operator: @admin, authorization_reference: "pilot-ref-#{SecureRandom.hex(3)}",
      authorized_at: Time.current, reason: "pilot gate", amount_cents: 500, payment_method_id: "pm_bank_other"
    )
    StripeModeGuard.stub(:check!, true) do
      Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "must not reach Stripe" }) do
        assert_raises(InternalFinancialSmokeTestService::Error, AchAccess::DisabledError) do
          InternalFinancialSmokeTestService.execute!(test_row, operator: @admin, live_execute: true)
        end
      end
    end
    assert_equal "authorized", test_row.reload.status
  ensure
    ENV.delete("INTERNAL_SMOKE_TEST_COMPANY_PROFILE_ID")
  end

  # ---- ungated paths ---------------------------------------------------------------

  test "webhook success reconciliation for a non-pilot company still applies under pilot mode" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    enable_pilot!([@pilot.id])
    other = @eligible.last
    job = Job.create!(
      company_profile: other, title: "pilot webhook job", description: "d", status: :pending_funding,
      funding_status: :adjustment_required, hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1
    )
    payment = job.payments.create!(amount_cents: 44_000, status: "pending", transfer_group: job.transfer_group, currency: "usd")
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound, amount_cents: 44_000,
      currency: "usd", status: :processing, idempotency_key: "tf_pilot_wh_#{job.id}", revision: 1,
      stripe_payment_intent_id: "pi_pilot_wh", payment_method_type: "us_bank_account", metadata_json: {}
    )
    intent = OpenStruct.new(
      id: "pi_pilot_wh", status: "succeeded", amount: 44_000, currency: "usd", customer: other.user.stripe_customer_id,
      latest_charge: "ch_pilot_wh", payment_method: "pm_bank", last_payment_error: nil,
      metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s, "payment_id" => payment.id.to_s }
    )
    JobAlertDispatcher.stub(:dispatch_for_job, true) do
      JobFundingService.apply_successful_intent!(job: job, txn: txn.reload, intent: intent)
    end
    assert txn.reload.status_succeeded?
    assert job.reload.funding_funded?
  end
end
