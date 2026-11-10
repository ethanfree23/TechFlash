# frozen_string_literal: true

require "test_helper"

class JobStripeOpsTransferGroupTest < ActiveSupport::TestCase
  setup do
    @old_key = Stripe.api_key
    Stripe.api_key = "sk_test_job_stripe_ops_transfer_group"
  end

  teardown do
    Stripe.api_key = @old_key
  end

  ChargeStub = Struct.new(:transfer_group, :payment_intent, keyword_init: true)
  PiStub = Struct.new(:transfer_group, keyword_init: true)
  TransferStub = Struct.new(:id, :transfer_group, :amount, :destination, keyword_init: true)

  test "transfer! omits transfer_group when source_transaction charge already has one" do
    captured = nil
    charge = ChargeStub.new(transfer_group: "TECHFLASH_JOB_42", payment_intent: "pi_42")
    created = TransferStub.new(id: "tr_omit_1", transfer_group: "TECHFLASH_JOB_42", amount: 500, destination: "acct_dest")

    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        Stripe::Charge.stub(:retrieve, ->(id) {
          assert_equal "ch_with_group", id
          charge
        }) do
          Stripe::Transfer.stub(:create, ->(params, _opts = nil) {
            captured = params
            created
          }) do
            result = JobStripeOps.transfer!(
              amount_cents: 500,
              destination: "acct_dest",
              metadata: { "job_id" => "42" },
              transfer_group: "TECHFLASH_JOB_42",
              idempotency_key: "tf_omit_group_1",
              source_transaction: "ch_with_group"
            )
            assert result.succeeded?, result.error
            assert_equal "tr_omit_1", result.stripe_id
          end
        end
      end
    end

    refute_nil captured
    assert_equal "ch_with_group", captured[:source_transaction]
    refute captured.key?(:transfer_group), "must omit transfer_group when source charge already has one: #{captured.inspect}"
  end

  test "transfer! omits transfer_group when PaymentIntent on charge has transfer_group" do
    captured = nil
    pi = PiStub.new(transfer_group: "TECHFLASH_JOB_99")
    charge = ChargeStub.new(transfer_group: nil, payment_intent: "pi_99")
    created = TransferStub.new(id: "tr_omit_2", transfer_group: "TECHFLASH_JOB_99", amount: 700, destination: "acct_dest")

    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        Stripe::Charge.stub(:retrieve, ->(_id) { charge }) do
          Stripe::PaymentIntent.stub(:retrieve, ->(id) {
            assert_equal "pi_99", id
            pi
          }) do
            Stripe::Transfer.stub(:create, ->(params, _opts = nil) {
              captured = params
              created
            }) do
              result = JobStripeOps.transfer!(
                amount_cents: 700,
                destination: "acct_dest",
                metadata: {},
                transfer_group: "TECHFLASH_JOB_99",
                idempotency_key: "tf_omit_group_2",
                source_transaction: "ch_pi_group"
              )
              assert result.succeeded?, result.error
            end
          end
        end
      end
    end

    refute captured.key?(:transfer_group), captured.inspect
    assert_equal "ch_pi_group", captured[:source_transaction]
  end

  test "transfer! includes transfer_group when source_transaction has none" do
    captured = nil
    charge = ChargeStub.new(transfer_group: nil, payment_intent: nil)
    created = TransferStub.new(id: "tr_set_1", transfer_group: "TECHFLASH_JOB_7", amount: 300, destination: "acct_dest")

    JobStripeOps.stub(:simulate_stripe?, false) do
      StripeModeGuard.stub(:error_message, nil) do
        Stripe::Charge.stub(:retrieve, ->(_id) { charge }) do
          Stripe::Transfer.stub(:create, ->(params, _opts = nil) {
            captured = params
            created
          }) do
            result = JobStripeOps.transfer!(
              amount_cents: 300,
              destination: "acct_dest",
              metadata: {},
              transfer_group: "TECHFLASH_JOB_7",
              idempotency_key: "tf_set_group_1",
              source_transaction: "ch_no_group"
            )
            assert result.succeeded?, result.error
          end
        end
      end
    end

    assert_equal "TECHFLASH_JOB_7", captured[:transfer_group]
    assert_equal "ch_no_group", captured[:source_transaction]
  end

  test "validate_recovered_transfer accepts inherited transfer_group on Stripe object" do
    job = Job.new
    job.define_singleton_method(:id) { 55 }
    job.define_singleton_method(:transfer_group) { "TECHFLASH_JOB_55" }
    txn = JobPaymentTransaction.new(
      amount_cents: 1000, currency: "usd", revision: 1, job_id: 55
    )
    txn.define_singleton_method(:job) { job }
    txn.define_singleton_method(:id) { 901 }
    txn.define_singleton_method(:job_id) { 55 }
    txn.define_singleton_method(:revision) { 1 }

    transfer = TransferStub.new(
      id: "tr_inherited",
      transfer_group: "TECHFLASH_JOB_55",
      amount: 1000,
      destination: "acct_tech"
    )
    transfer.define_singleton_method(:metadata) do
      { "transaction_id" => "901", "job_id" => "55", "revision" => "1" }
    end
    transfer.define_singleton_method(:currency) { "usd" }

    validation = PaymentService.validate_recovered_transfer(transfer, txn, destination: "acct_tech")
    assert validation[:ok], validation.inspect
  end
end
