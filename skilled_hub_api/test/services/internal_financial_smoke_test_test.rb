# frozen_string_literal: true

require "test_helper"

class InternalFinancialSmokeTestTest < ActiveSupport::TestCase
  setup do
    @admin = User.create!(
      email: "smoke-admin-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :admin
    )
    @company_user = User.create!(
      email: "smoke-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company
    )
    @company_profile = CompanyProfile.create!(
      user: @company_user,
      membership_level: "basic",
      phone: "713-555-0100",
      ach_payments_enabled: true
    )
    @company_user.update_column(:company_profile_id, @company_profile.id)
    AchAccess.set_global!(enabled: true, actor: @admin)
  end

  test "authorize creates row capped at 500 cents" do
    row = InternalFinancialSmokeTestService.authorize!(
      company_profile: @company_profile,
      actor: @admin,
      amount_cents: 500,
      reason: "pilot authorization"
    )
    assert row.status_authorized?
    assert_nil row.idempotency_key
    assert_equal 500, row.amount_cents
  end

  test "execute uses smoke metadata and no transfer_group" do
    row = InternalFinancialSmokeTestService.authorize!(
      company_profile: @company_profile,
      actor: @admin,
      amount_cents: 500,
      reason: "pilot"
    )

    captured = {}
    row_id = row.id
    JobStripeOps.stub(:create_payment_intent!, lambda { |**kwargs|
      captured.merge!(kwargs)
      JobStripeOps::Result.new(
        status: "processing",
        stripe_id: "pi_smoke_test",
        payment_method_type: "us_bank_account"
      )
    }) do
      JobFundingService.stub(:default_payment_method_id, "pm_bank_smoke") do
        JobFundingService.stub(:payment_method_type_for, "us_bank_account") do
          StripeCustomerService.stub(:validate_or_clear_customer_id!, "cus_smoke") do
            charged = InternalFinancialSmokeTestService.execute_charge!(smoke_test: row, actor: @admin)
            assert charged.status_processing?
          end
        end
      end
    end

    assert_equal "true", captured[:metadata][:techflash_smoke_test]
    assert_equal row_id.to_s, captured[:metadata][:smoke_test_id]
    assert_nil captured[:transfer_group]
    assert_equal "tf_smoke_#{row_id}", captured[:idempotency_key]
    assert_equal 0, JobPaymentTransaction.count
    assert_equal 0, Payment.count
  end

  test "smoke webhook updates row only" do
    row = InternalFinancialSmokeTest.create!(
      company_profile: @company_profile,
      authorized_by_user: @admin,
      authorization_reason: "test",
      amount_cents: 500,
      status: :processing,
      idempotency_key: "tf_smoke_99",
      charge_initiated_at: Time.current,
      stripe_payment_intent_id: "pi_smoke_wh"
    )

    intent = OpenStruct.new(
      id: "pi_smoke_wh",
      status: "succeeded",
      latest_charge: "ch_smoke",
      payment_method: "pm_bank",
      metadata: { "techflash_smoke_test" => "true", "smoke_test_id" => row.id.to_s }
    )

    JobStripeOps.stub(:payment_method_display, { payment_method_id: "pm_bank", payment_method_type: "us_bank_account" }) do
      Api::V1::StripeWebhooksController.new.send(:reconcile_payment_intent_succeeded, intent)
    end

    assert row.reload.status_succeeded?
    assert JobPaymentTransaction.count.zero?
  end

  test "one-shot execute is rejected after charge initiated" do
    row = InternalFinancialSmokeTestService.authorize!(
      company_profile: @company_profile,
      actor: @admin,
      amount_cents: 500,
      reason: "pilot"
    )
    row.update!(charge_initiated_at: Time.current, status: :outcome_unknown, idempotency_key: "tf_smoke_#{row.id}")

    err = assert_raises(InternalFinancialSmokeTestService::Error) do
      InternalFinancialSmokeTestService.execute_charge!(smoke_test: row, actor: @admin)
    end
    assert_match(/one-shot/i, err.message)
  end
end
