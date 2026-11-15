# frozen_string_literal: true

require "test_helper"
require "ostruct"

class AchGeneralAvailabilityTest < ActiveSupport::TestCase
  setup do
    PlatformSetting.where(key: AchAccess::GLOBAL_SETTING_KEY).delete_all
    ENV.delete("ACH_GLOBAL_DISABLED")
    @admin = User.create!(
      email: "ach-ga-admin-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :admin
    )
  end

  teardown do
    ENV.delete("ACH_GLOBAL_DISABLED")
  end

  def make_company(name:)
    user = User.create!(
      email: "ach-ga-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company,
      stripe_customer_id: "cus_#{SecureRandom.hex(4)}"
    )
    # Rely on column default (true after GA migration).
    cp = CompanyProfile.create!(user: user, membership_level: "basic", company_name: name, phone: "713-555-2000")
    user.update_column(:company_profile_id, cp.id)
    cp
  end

  test "new company is ACH-available by default when global ON" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    cp = make_company(name: "New Co")
    assert_equal true, cp.ach_payments_enabled
    assert AchAccess.allowed?(cp)
  end

  test "existing company with default-true is allowed when global ON" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    cp = make_company(name: "Existing Co")
    assert AchAccess.allowed?(cp)
  end

  test "explicitly admin-blocked company stays denied when global ON" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    cp = make_company(name: "Blocked Co")
    AchAccess.set_company!(cp, enabled: false, actor: @admin, source: "admin")
    cp.reload
    assert_equal false, cp.ach_payments_enabled
    refute AchAccess.allowed?(cp)
    audit = AchFeatureAudit.where(scope: "company", company_profile_id: cp.id).order(:id).last
    assert_equal false, audit.new_value
  end

  test "global DB OFF denies even when company flag true" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    cp = make_company(name: "Global Off Co")
    assert cp.ach_payments_enabled
    refute AchAccess.allowed?(cp)
  end

  test "ENV ACH_GLOBAL_DISABLED denies new initiation" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    cp = make_company(name: "Env Kill Co")
    ENV["ACH_GLOBAL_DISABLED"] = "true"
    refute AchAccess.allowed?(cp)
    assert_raises(AchAccess::DisabledError) { AchAccess.assert_allowed!(cp) }
  end

  test "webhook success path still works while global OFF" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    cp = make_company(name: "Webhook Co")
    AchAccess.set_company!(cp, enabled: false, actor: @admin)
    refute AchAccess.allowed?(cp)

    job = Job.create!(
      company_profile: cp, title: "processing job", description: "d", status: :pending_funding,
      funding_status: :adjustment_required,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1, go_live_at: Time.current
    )
    payment = Payment.create!(job: job, amount_cents: 44_000, status: "pending", currency: "usd")
    txn = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      stripe_payment_intent_id: "pi_ach_ga_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_ach_ga_#{job.id}_#{SecureRandom.hex(4)}",
      revision: 1
    )

    # apply_successful_intent! must not consult AchAccess for already-processing ACH.
    intent = OpenStruct.new(id: txn.stripe_payment_intent_id, latest_charge: "ch_ach_ga_ok")
    JobFundingService.apply_successful_intent!(job: job, txn: txn, intent: intent)
    assert txn.reload.status_succeeded?
    assert job.reload.open? || job.funding_funded?
  end

  test "legacy false without audit is flipped; explicit admin block audit keeps denied" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    legacy = make_company(name: "Legacy False")
    legacy.update_column(:ach_payments_enabled, false)
    blocked = make_company(name: "Explicit Block")
    AchAccess.set_company!(blocked, enabled: false, actor: @admin, source: "admin")

    # Mirror migration enable logic (safe to re-run in tests without change_column_default).
    latest_by_company = {}
    AchFeatureAudit.where(scope: "company").where.not(company_profile_id: nil)
                   .order(:company_profile_id, created_at: :desc, id: :desc)
                   .each { |row| latest_by_company[row.company_profile_id] ||= row }
    blocked_ids = latest_by_company.select { |_id, row| row.new_value == false }.keys
    CompanyProfile.where(ach_payments_enabled: false).where.not(id: blocked_ids)
                  .update_all(ach_payments_enabled: true)

    assert_equal true, legacy.reload.ach_payments_enabled
    assert AchAccess.allowed?(legacy)
    assert_equal false, blocked.reload.ach_payments_enabled
    refute AchAccess.allowed?(blocked)
    assert_equal false, AchFeatureAudit.where(company_profile_id: blocked.id, scope: "company").order(:id).last.new_value
  end

  test "hard delete blocked when any JobPaymentTransaction exists including processing" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    cp = make_company(name: "Delete Guard Co")
    company_user = cp.user
    job = Job.create!(
      company_profile: cp, title: "has processing", description: "d", status: :open,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10,
      agreed_labor_cents: 40_000, financial_revision: 1, go_live_at: Time.current
    )
    payment = Payment.create!(job: job, amount_cents: 44_000, status: "pending", currency: "usd")
    JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: 44_000,
      currency: "usd",
      status: :processing,
      payment_method_type: "us_bank_account",
      stripe_payment_intent_id: "pi_del_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_del_#{job.id}_#{SecureRandom.hex(4)}",
      revision: 1
    )

    controller = Api::V1::JobsController.new
    reason = controller.send(:undeletable_reason, job)
    assert_match(/payment activity/i, reason.to_s)
  end
end
