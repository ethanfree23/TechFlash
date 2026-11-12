# frozen_string_literal: true

require "test_helper"
require "ostruct"

class AchAccessAndInitiationGateTest < ActiveSupport::TestCase
  setup do
    PlatformSetting.where(key: AchAccess::GLOBAL_SETTING_KEY).delete_all
    ENV.delete("ACH_GLOBAL_DISABLED")
    @admin = User.create!(
      email: "ach-admin-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :admin
    )
    @co_a = User.create!(
      email: "ach-a-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company,
      stripe_customer_id: "cus_ach_a"
    )
    @cp_a = CompanyProfile.create!(user: @co_a, membership_level: "basic", company_name: "A Co", phone: "713-555-1001")
    @co_a.update_column(:company_profile_id, @cp_a.id)
    @co_b = User.create!(
      email: "ach-b-#{SecureRandom.hex(3)}@example.com",
      password: "password123", password_confirmation: "password123", role: :company,
      stripe_customer_id: "cus_ach_b"
    )
    @cp_b = CompanyProfile.create!(user: @co_b, membership_level: "basic", company_name: "B Co", phone: "713-555-1002")
    @co_b.update_column(:company_profile_id, @cp_b.id)
  end

  teardown do
    ENV.delete("ACH_GLOBAL_DISABLED")
  end

  test "fail closed when global setting absent" do
    refute AchAccess.global_enabled?
    refute AchAccess.allowed?(@cp_a)
  end

  test "explicit company disable blocks only that company when global ON" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    # GA default: companies are enabled; explicitly block B only.
    AchAccess.set_company!(@cp_b, enabled: false, actor: @admin)
    assert AchAccess.allowed?(@cp_a)
    refute AchAccess.allowed?(@cp_b)
  end

  test "global kill switch ENV overrides company flag" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    AchAccess.set_company!(@cp_a, enabled: true, actor: @admin)
    ENV["ACH_GLOBAL_DISABLED"] = "true"
    refute AchAccess.global_enabled?
    refute AchAccess.allowed?(@cp_a)
  end

  test "admin toggles write audit rows" do
    AchAccess.set_global!(enabled: true, actor: @admin, source: "test")
    AchAccess.set_company!(@cp_a, enabled: true, actor: @admin, source: "test")
    audits = AchFeatureAudit.order(:id).last(2)
    assert_equal 2, audits.size
    assert_equal "global", audits.first.scope
    assert_equal true, audits.first.new_value
    assert_equal "company", audits.last.scope
    assert_equal @cp_a.id, audits.last.company_profile_id
  end

  test "setup intent for bank blocked when flag off; card still allowed path" do
    assert_raises(CompanyPaymentMethodsService::Error) do
      CompanyPaymentMethodsService.create_setup_intent!(@co_a, payment_method_type: "us_bank_account")
    end
  end

  test "collect with saved bank PM refused when flag disabled" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    job = Job.create!(
      company_profile: @cp_a, title: "ach gate job", description: "d", status: :pending_funding,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1
    )
    JobFundingService.ensure_header!(job)
    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeCustomerService.stub(:validate_or_clear_customer_id!, "cus_ach_a") do
        JobFundingService.stub(:default_payment_method_id, "pm_bank_saved") do
          JobFundingService.stub(:payment_method_type_for, "us_bank_account") do
            creates = 0
            JobStripeOps.stub(:create_payment_intent!, ->(**_k) { creates += 1; raise "should not create ACH PI" }) do
              result = JobFundingService.collect!(
                job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
              )
              assert result[:ach_disabled]
              assert_match(/not enabled/i, result[:error])
              assert_equal 0, creates
            end
          end
        end
      end
    end
  end

  test "card collect unaffected when ACH off" do
    AchAccess.set_global!(enabled: false, actor: @admin)
    job = Job.create!(
      company_profile: @cp_a, title: "card ok", description: "d", status: :pending_funding,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1
    )
    JobFundingService.ensure_header!(job)
    JobStripeOps.stub(:simulate_stripe?, false) do
      JobFundingService.stub(:default_payment_method_id, "pm_card") do
        JobFundingService.stub(:payment_method_type_for, "card") do
          JobStripeOps.stub(:create_payment_intent!, ->(**_k) {
            JobStripeOps::Result.new(status: "succeeded", stripe_id: "pi_card_ok", charge_id: "ch_card_ok",
                                     payment_method_id: "pm_card", payment_method_type: "card", payment_method_last4: "4242", payment_method_brand: "visa")
          }) do
            StripeCustomerService.stub(:validate_or_clear_customer_id!, "cus_ach_a") do
              result = JobFundingService.collect!(
                job: job, amount_cents: 10_000, transaction_type: :initial_job_charge, revision: 1
              )
              assert result[:success], result.inspect
            end
          end
        end
      end
    end
  end

  test "disable ACH while debit processing still allows webhook success path" do
    AchAccess.set_global!(enabled: true, actor: @admin)
    AchAccess.set_company!(@cp_a, enabled: true, actor: @admin)
    job = Job.create!(
      company_profile: @cp_a, title: "proc then disable", description: "d", status: :pending_funding,
      funding_status: :unfunded, hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000, financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound,
      amount_cents: 44_000, currency: "usd", status: :processing, payment_method_type: "us_bank_account",
      stripe_payment_intent_id: "pi_proc_#{SecureRandom.hex(4)}",
      idempotency_key: "tf_proc_#{SecureRandom.hex(4)}", revision: 1, processing_at: Time.current
    )
    AchAccess.set_company!(@cp_a, enabled: false, actor: @admin)
    AchAccess.set_global!(enabled: false, actor: @admin)
    refute AchAccess.allowed?(@cp_a.reload)

    intent = OpenStruct.new(
      id: txn.stripe_payment_intent_id,
      status: "succeeded",
      latest_charge: "ch_proc_ok",
      amount: txn.amount_cents,
      currency: "usd",
      payment_method: "pm_bank",
      metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s }
    )
    # Webhook completion must still work with ACH flags off.
    JobFundingService.apply_successful_intent!(job: job, txn: txn, intent: intent)
    assert txn.reload.status_succeeded?
  end

  test "kill switch does not block technician transfer reconcile path" do
    ENV["ACH_GLOBAL_DISABLED"] = "true"
    job = Job.create!(
      company_profile: @cp_a, title: "xfer ok", description: "d", status: :finished,
      funding_status: :funded, settlement_status: :settled, finished_at: 2.days.ago,
      hourly_rate_cents: 5000, hours_per_day: 8, days: 1,
      company_commission_percent_snapshot: 10, technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 90_000, financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :initial_job_charge, direction: :inbound,
      amount_cents: 110_000, currency: "usd", status: :succeeded, stripe_charge_id: "ch_x",
      idempotency_key: "tf_col_#{SecureRandom.hex(4)}", revision: 1, succeeded_at: Time.current
    )
    txn = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 72_000, currency: "usd", status: :outcome_unknown, revision: 1,
      transfer_first_attempted_at: 1.hour.ago,
      idempotency_key: "tf_job_#{job.id}_txn_technician_transfer_r1",
      metadata_json: { "source_allocation" => { "charge_id" => "ch_x", "mode" => "single_charge", "reason" => "ok", "safe" => true } }
    )
    tech_user = User.create!(email: "t-#{SecureRandom.hex(3)}@ex.com", password: "password123", password_confirmation: "password123", role: :technician)
    tp = TechnicianProfile.create!(
      user: tech_user, trade_type: "General", availability: "Full-time", membership_level: "basic",
      stripe_account_id: "acct_kill_ok", stripe_charges_enabled: true, stripe_payouts_enabled: true,
      stripe_details_submitted: true, stripe_transfers_capability_status: "active"
    )
    JobApplication.create!(job: job, technician_profile: tp, status: :accepted)
    fake = OpenStruct.new(
      id: "tr_kill", amount: 72_000, currency: "usd", destination: "acct_kill_ok",
      transfer_group: job.transfer_group,
      metadata: { "transaction_id" => txn.id.to_s, "job_id" => job.id.to_s, "revision" => "1" }
    )
    JobStripeOps.stub(:find_transfer_for_transaction, ->(**_k) {
      JobStripeOps::LookupResult.new(status: "found", transfer: fake)
    }) do
      result = PaymentService.reconcile_technician_transfer!(txn)
      assert result[:success], result.inspect
    end
  end
end
