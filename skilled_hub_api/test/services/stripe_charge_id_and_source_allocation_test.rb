# frozen_string_literal: true

require "test_helper"

class StripeChargeIdAndSourceAllocationTest < ActiveSupport::TestCase
  setup do
    @company_user = User.create!(
      email: "py-co-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :company,
      stripe_customer_id: "cus_py_shape"
    )
    @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
    @company_user.update_column(:company_profile_id, @company_profile.id)
  end

  def funded_job!(charge_id:, amount: 44_000)
    job = Job.create!(
      company_profile: @company_profile,
      title: "py shape #{SecureRandom.hex(3)}",
      description: "d",
      status: :finished,
      funding_status: :funded,
      finished_at: 4.days.ago,
      hourly_rate_cents: 5000,
      hours_per_day: 8,
      days: 1,
      company_commission_percent_snapshot: 10,
      technician_commission_percent_snapshot: 20,
      agreed_labor_cents: 40_000,
      financial_revision: 1
    )
    payment = JobFundingService.ensure_header!(job)
    txn = JobPaymentTransaction.create!(
      payment: payment,
      job: job,
      transaction_type: :initial_job_charge,
      direction: :inbound,
      amount_cents: amount,
      currency: "usd",
      status: :succeeded,
      stripe_charge_id: charge_id,
      stripe_payment_intent_id: "pi_#{SecureRandom.hex(4)}",
      payment_method_type: "us_bank_account",
      idempotency_key: "tf_py_#{SecureRandom.hex(6)}",
      revision: 1,
      succeeded_at: Time.current
    )
    [job, payment, txn]
  end

  test "valid_shape accepts ch_ and py_ charge ids" do
    assert StripeChargeId.valid_shape?("ch_3UaMUWRsck7C7qtp1fjV2Yj0")
    assert StripeChargeId.valid_shape?("py_3UaMUWRsck7C7qtp1fjV2Yj0")
  end

  test "valid_shape rejects pi_ blank and garbage" do
    refute StripeChargeId.valid_shape?("pi_3UaMUWRsck7C7qtp0h68vcUd")
    refute StripeChargeId.valid_shape?("")
    refute StripeChargeId.valid_shape?(nil)
    refute StripeChargeId.valid_shape?("not_a_stripe_id")
    refute StripeChargeId.valid_shape?("re_123")
    refute StripeChargeId.valid_shape?("tr_123")
  end

  test "source_transaction_decision accepts ch_ charge id" do
    job, _payment, _txn = funded_job!(charge_id: "ch_card_ok_1")
    decision = PaymentService.source_transaction_decision(job, amount_cents: 1_000)
    assert decision[:safe], decision.inspect
    assert_equal "single_charge", decision[:mode]
    assert_equal "ch_card_ok_1", decision[:charge_id]
  end

  test "source_transaction_decision accepts py_ ACH charge id" do
    job, _payment, _txn = funded_job!(charge_id: "py_3UaMUWRsck7C7qtp1fjV2Yj0")
    decision = PaymentService.source_transaction_decision(job, amount_cents: 1_000)
    assert decision[:safe], decision.inspect
    assert_equal "single_charge", decision[:mode]
    assert_equal "py_3UaMUWRsck7C7qtp1fjV2Yj0", decision[:charge_id]
    assert_equal "ok", decision[:reason]
  end

  test "source_transaction_decision rejects pi_ as charge id shape" do
    job, _payment, _txn = funded_job!(charge_id: "pi_not_a_charge")
    decision = PaymentService.source_transaction_decision(job, amount_cents: 1_000)
    assert_equal "blocked", decision[:mode]
    assert_equal "invalid_charge_id_shape", decision[:reason]
  end

  test "source_transaction_decision rejects garbage charge id shape" do
    job, _payment, _txn = funded_job!(charge_id: "totally_bogus")
    decision = PaymentService.source_transaction_decision(job, amount_cents: 1_000)
    assert_equal "blocked", decision[:mode]
    assert_equal "invalid_charge_id_shape", decision[:reason]
  end

  test "mismatched charge id is rejected even when shape is valid" do
    job, _payment, txn = funded_job!(charge_id: "py_job_owned_charge")
    assert StripeChargeId.matches_job_succeeded_charge?("py_job_owned_charge", job)
    refute StripeChargeId.matches_job_succeeded_charge?("py_other_job_charge", job)
    refute StripeChargeId.belongs_to_succeeded_collection?("ch_stranger", job)

    # Persist a forged allocation pointing at a foreign py_ id, then release-path checks must block.
    tech_user = User.create!(
      email: "py-tech-#{SecureRandom.hex(3)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "713-555-0100"
    )
    tp = TechnicianProfile.create!(
      user: tech_user, trade_type: "General", availability: "Full-time", membership_level: "basic",
      phone: "713-555-0100", stripe_account_id: "acct_py_dest",
      stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_details_submitted: true,
      stripe_transfers_capability_status: "active"
    )
    JobApplication.create!(job: job, technician_profile: tp, status: :accepted)
    payment = txn.payment
    key = "tf_job_#{job.id}_txn_technician_transfer_r#{job.financial_revision}"
    xfer = JobPaymentTransaction.create!(
      payment: payment, job: job, transaction_type: :technician_transfer, direction: :outbound,
      amount_cents: 32_000, currency: "usd", status: :pending, revision: job.financial_revision,
      idempotency_key: key,
      metadata_json: {
        "source_allocation" => {
          "charge_id" => "py_other_job_charge",
          "mode" => "single_charge",
          "reason" => "ok",
          "safe" => true
        }
      }
    )

    StripeConnectAccountService.stub(:payout_ready?, true) do
      JobStripeOps.stub(:transfer!, ->(**_k) { flunk "must not create transfer for mismatched charge" }) do
        result = PaymentService.release_to_technician(payment)
        refute result[:success]
        assert_match(/mismatched_source_charge|invalid_charge_id_shape/i, result[:error].to_s)
      end
    end
    assert xfer.reload.status_pending? || xfer.status_failed? || xfer.status_outcome_unknown?
  end

  test "JobStripeOps.transfer! accepts py_ source_transaction shape" do
    captured = nil
    charge = Struct.new(:transfer_group, :payment_intent).new("TECHFLASH_JOB_1", nil)
    created = Struct.new(:id, :transfer_group).new("tr_py_ok", "TECHFLASH_JOB_1")

    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        Stripe.stub(:api_key, "sk_test_py_shape") do
          Stripe::Charge.stub(:retrieve, ->(_id) { charge }) do
            Stripe::Transfer.stub(:create, ->(params, _opts = nil) {
              captured = params
              created
            }) do
              result = JobStripeOps.transfer!(
                amount_cents: 500,
                destination: "acct_x",
                metadata: {},
                transfer_group: "TECHFLASH_JOB_1",
                idempotency_key: "tf_py_shape_1",
                source_transaction: "py_3UaMUWRsck7C7qtp1fjV2Yj0"
              )
              assert result.succeeded?, result.error
            end
          end
        end
      end
    end
    assert_equal "py_3UaMUWRsck7C7qtp1fjV2Yj0", captured[:source_transaction]
  end

  test "JobStripeOps.transfer! rejects pi_ source_transaction shape" do
    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        Stripe.stub(:api_key, "sk_test_py_shape") do
          result = JobStripeOps.transfer!(
            amount_cents: 500,
            destination: "acct_x",
            metadata: {},
            transfer_group: "g",
            idempotency_key: "tf_pi_bad",
            source_transaction: "pi_not_allowed"
          )
          refute result.succeeded?
          assert_match(/Charge ID|ch_|py_/i, result.error)
        end
      end
    end
  end

  test "runner print_table does not truncate FAIL details" do
    source = File.read(Rails.root.join("lib/staging_ach_e2e_runner.rb"))
    method = source[/def print_table!.*?^  end$/m]
    refute_nil method
    assert_match(/status == ["']PASS["']/, method)
    refute_match(/FAIL.*\[0,\s*\d+\]|detail\.to_s\[0,\s*\d+\]\s*$/, method.lines.grep(/FAIL|detail/).join)
  end
end
