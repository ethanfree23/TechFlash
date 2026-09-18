# frozen_string_literal: true

require "test_helper"
require "digest"

module Jobs
  class TerminationSettlementRaceTest < ActiveSupport::TestCase
    setup do
      @company_user = User.create!(
        email: "race-co-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
      @company_user.update_column(:company_profile_id, @company_profile.id)

      @tech_user = User.create!(
        email: "race-tech-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :technician
      )
      @tech_profile = TechnicianProfile.create!(
        user: @tech_user,
        trade_type: "General",
        availability: "Full-time",
        membership_level: "basic",
        stripe_account_id: "acct_test",
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_details_submitted: true,
        stripe_transfers_capability_status: "active"
      )
    end

    def succeed_stripe!
      success = JobStripeOps::Result.new(status: "succeeded", stripe_id: "obj_#{SecureRandom.hex(4)}")
      JobStripeOps.stub(:create_payment_intent!, success) do
        JobStripeOps.stub(:refund!, success) do
          JobStripeOps.stub(:transfer!, success) { yield }
        end
      end
    end

    def claimed_job
      job = Job.create!(
        company_profile: @company_profile,
        title: "Race job",
        description: "desc",
        status: :pending_funding,
        pay_basis: :actual_hours_worked,
        hourly_rate_cents: 7_500,
        hours_per_day: 8,
        days: 10,
        job_timezone: "UTC",
        scheduled_start_at: 2.days.ago,
        scheduled_end_at: 8.days.from_now,
        go_live_at: 6.days.ago
      )
      succeed_stripe! { JobFundingService.fund_for_publish!(job) }
      JobFundingService.snapshot_technician!(job, @tech_profile)
      JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
      job.update!(status: :filled)
      job.reload
    end

    def approve_hours!(job, worked_hours, ended_at: 1.day.ago.change(hour: 16))
      entry = job.time_entries.create!(
        technician_profile: @tech_profile,
        submitted_by_user: @tech_user,
        worked_start_at: ended_at - worked_hours.hours,
        worked_end_at: ended_at,
        worked_on_date: ended_at.to_date,
        worked_hours: worked_hours,
        job_timezone: "UTC",
        status: :approved
      )
      entry.create_time_entry_pay_line!(
        job: job,
        base_hourly_rate_cents: job.hourly_rate_cents,
        applied_multiplier: 1,
        effective_hourly_rate_cents: job.hourly_rate_cents,
        worked_hours: worked_hours,
        gross_pay_cents: (job.hourly_rate_cents * worked_hours).to_i,
        premium_combination_rule: :highest_applicable
      )
      entry
    end

    def terminate!(job, actor: @company_user, reason: "project_canceled")
      result = nil
      succeed_stripe! do
        result = TerminateAssignmentService.call(job: job, actor_user: actor, reason: reason)
      end
      result
    end

    def settlement_refunds(job)
      job.job_payment_transactions
        .status_succeeded
        .where(transaction_type: JobPaymentTransaction::SETTLEMENT_REFUND_TYPES)
    end

    def with_idempotent_stripe_refunds
      keys = []
      stripe_ids = {}
      mutex = Mutex.new
      transfer = JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_#{SecureRandom.hex(4)}")
      refund_impl = lambda do |amount_cents:, payment_intent_id:, metadata:, idempotency_key:|
        mutex.synchronize do
          keys << idempotency_key
          stripe_ids[idempotency_key] ||= "re_#{Digest::SHA1.hexdigest(idempotency_key.to_s)[0, 12]}"
          JobStripeOps::Result.new(status: "succeeded", stripe_id: stripe_ids[idempotency_key])
        end
      end

      JobStripeOps.stub(:refund!, refund_impl) do
        JobStripeOps.stub(:transfer!, transfer) { yield keys, stripe_ids }
      end
    end

    test "cancellation_refund and final_hours_refund share one settlement Stripe identity" do
      args = { job_id: 9, amount_cents: 12_345, payment_intent_id: "pi_abc", revision: 4 }
      cancel = JobFundingService.refund_idempotency_key(**args, transaction_type: :cancellation_refund)
      hours = JobFundingService.refund_idempotency_key(**args, transaction_type: :final_hours_refund)
      counter = JobFundingService.refund_idempotency_key(**args, transaction_type: :counteroffer_refund)

      assert_equal hours, cancel
      assert_equal "tf_job_9_settlement_refund_r4_pi_abc_12345", cancel
      refute_equal cancel, counter
      assert_includes JobFundingService.settlement_refund_identity_keys(**args),
                      "tf_job_9_txn_final_hours_refund_r4_pi_abc_12345"
      assert_includes JobFundingService.settlement_refund_identity_keys(**args),
                      "tf_job_9_txn_cancellation_refund_r4_pi_abc_12345"
    end

    test "A: terminate settlement racing PaymentsReleaseRunner produces one Stripe refund" do
      job = claimed_job
      approve_hours!(job, 8)
      job.update!(status: :finished, finished_at: Time.current, terminated_at: Time.current)

      with_idempotent_stripe_refunds do |keys, stripe_ids|
        terminate_settle = JobSettlementService.settle_and_release_if_eligible!(
          job,
          refund_transaction_type: :cancellation_refund,
          allow_zero_labor: true
        )
        runner_settle = PaymentsReleaseRunner.call

        assert terminate_settle[:success], terminate_settle[:error].to_s
        assert runner_settle[:failed].blank?, runner_settle.inspect
      end

      job.reload
      assert job.settlement_settled?
      assert_equal 1, settlement_refunds(job).count
      assert_equal 1, settlement_refunds(job).distinct.count(:idempotency_key)
    end

    test "A: cancellation_refund and final_hours_refund slices cannot both succeed for the same leftover" do
      job = claimed_job
      payment = job.payments.order(:id).first
      pi = payment.stripe_payment_intent_id.presence || "pi_test_#{job.id}"
      amount = 1_500
      revision = job.financial_revision.to_i + 1

      with_idempotent_stripe_refunds do |_keys, stripe_ids|
        first = JobFundingService.refund_slice!(
          job: job,
          amount_cents: amount,
          payment_intent_id: pi,
          transaction_type: :cancellation_refund,
          revision: revision
        )
        second = JobFundingService.refund_slice!(
          job: job,
          amount_cents: amount,
          payment_intent_id: pi,
          transaction_type: :final_hours_refund,
          revision: revision
        )

        assert first[:success], first[:error].to_s
        assert second[:success], second[:error].to_s
        assert_equal first[:transaction].id, second[:transaction].id
        assert_equal 1, stripe_ids.size
      end

      assert_equal 1, settlement_refunds(job.reload).count
    end

    test "B: repeated termination does not refund again" do
      job = claimed_job
      approve_hours!(job, 8)
      first = terminate!(job)
      assert first.success?, first.error
      count = settlement_refunds(job.reload).count
      assert count.positive?

      second = terminate!(job, reason: "project_completed_early")
      assert second.success?
      assert second.idempotent
      PaymentsReleaseRunner.call
      assert_equal count, settlement_refunds(job.reload).count
    end

    test "C: repeated PaymentsReleaseRunner does not refund again" do
      job = claimed_job
      approve_hours!(job, 8)
      assert terminate!(job).success?
      count = settlement_refunds(job.reload).count

      2.times { PaymentsReleaseRunner.call }

      job.reload
      assert job.settlement_settled?
      refute_equal "settlement_blocked", job.settlement_status
      assert_equal count, settlement_refunds(job).count
    end

    test "D: zero-hour terminate then runner remains settled and refunded" do
      job = claimed_job
      original_net = JobLedger.for(job).net_funded_cents
      assert terminate!(job).success?

      job.reload
      assert job.settlement_settled?
      assert_equal original_net, settlement_refunds(job).sum(:amount_cents)

      PaymentsReleaseRunner.call

      job.reload
      assert job.settlement_settled?
      refute_equal "settlement_blocked", job.settlement_status
      assert_equal 1, settlement_refunds(job).count
      assert_equal original_net, settlement_refunds(job).sum(:amount_cents)
      assert_equal 0, JobLedger.for(job).labor_cents
    end

    test "E: failed zero-hour refund then retry yields exactly one successful refund" do
      job = claimed_job
      original_net = JobLedger.for(job).net_funded_cents
      attempts = 0
      refund_impl = lambda do |amount_cents:, payment_intent_id:, metadata:, idempotency_key:|
        attempts += 1
        if attempts == 1
          JobStripeOps::Result.new(status: "failed", error: "temporary stripe error")
        else
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "re_retry_#{idempotency_key}")
        end
      end
      transfer = JobStripeOps::Result.new(status: "succeeded", stripe_id: "tr_retry")

      JobStripeOps.stub(:refund!, refund_impl) do
        JobStripeOps.stub(:transfer!, transfer) do
          first = TerminateAssignmentService.call(
            job: job,
            actor_user: @company_user,
            reason: "project_canceled"
          )
          assert first.success?, first.error
          job.reload
          refute job.settlement_settled?
          assert_equal 0, settlement_refunds(job).count

          PaymentsReleaseRunner.call
        end
      end

      job.reload
      assert job.settlement_settled?, job.settlement_status
      assert_equal 1, settlement_refunds(job).count
      assert_equal original_net, settlement_refunds(job).sum(:amount_cents)
      assert_equal 2, attempts
    end

    test "H: preview projected money matches settlement ledger primitives and does not mutate the job" do
      job = claimed_job
      approve_hours!(job, 8)
      before = job.reload.attributes.slice(
        "status", "agreed_labor_cents", "financial_revision", "settlement_status", "terminated_at"
      )

      summary = TerminationSummary.call(job: job)
      labor = JobSettlementService.settlement_labor_cents(job)
      labor = 0 if labor.nil?
      projected = JobLedger.projection(job, labor_cents: labor)

      assert_equal projected.labor_cents, summary.projected_labor_cents
      assert_equal projected.company_required_cents, summary.projected_company_required_cents
      assert_equal projected.amount_refundable_cents, summary.projected_refund_cents
      assert_equal projected.amount_due_cents, summary.projected_additional_charge_cents
      assert_equal projected.technician_net_payout_cents, summary.projected_technician_payout_cents
      assert projected.amount_refundable_cents.positive?

      job.reload
      assert_equal before["status"], job.status
      assert_equal before["agreed_labor_cents"], job.agreed_labor_cents
      assert_equal before["financial_revision"], job.financial_revision
      assert_equal before["settlement_status"], job.settlement_status
      assert_nil job.terminated_at
      refute job.job_payment_transactions.where(transaction_type: JobPaymentTransaction::SETTLEMENT_REFUND_TYPES).exists?
    end

    test "company total_spent_cents uses retained ledger funding not original gross" do
      job = claimed_job
      original_gross = job.company_charge_cents.to_i
      approve_hours!(job, 8)
      assert terminate!(job).success?

      retained = JobLedger.for(job.reload).net_funded_cents
      metrics = CompanyMetrics.for_company_profile(@company_profile)

      assert retained.positive?
      assert retained < original_gross
      assert_equal retained, metrics[:total_spent_cents]
    end

    test "zero-hour termination does not keep refunded money in company spend" do
      job = claimed_job
      original_gross = job.company_charge_cents.to_i
      assert original_gross.positive?
      assert terminate!(job).success?

      metrics = CompanyMetrics.for_company_profile(@company_profile)
      assert_equal 0, JobLedger.for(job.reload).net_funded_cents
      assert_equal 0, metrics[:total_spent_cents]
    end
  end
end
