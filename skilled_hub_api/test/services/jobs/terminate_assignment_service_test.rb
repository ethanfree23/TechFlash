# frozen_string_literal: true

require "test_helper"

module Jobs
  class TerminateAssignmentServiceTest < ActiveSupport::TestCase
    include ActiveSupport::Testing::TimeHelpers

    setup do
      @company_user = User.create!(
        email: "term-co-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
      @company_user.update_column(:company_profile_id, @company_profile.id)

      @tech_user = User.create!(
        email: "term-tech-#{SecureRandom.hex(4)}@example.com",
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

      @other_company_user = User.create!(
        email: "term-other-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :company
      )
      other_profile = CompanyProfile.create!(user: @other_company_user, membership_level: "basic")
      @other_company_user.update_column(:company_profile_id, other_profile.id)

      @admin = User.create!(
        email: "term-admin-#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        password_confirmation: "password123",
        role: :admin
      )
      ActionMailer::Base.deliveries.clear
    end

    def succeed_stripe!
      success = JobStripeOps::Result.new(status: "succeeded", stripe_id: "obj_#{SecureRandom.hex(4)}")
      JobStripeOps.stub(:create_payment_intent!, success) do
        JobStripeOps.stub(:refund!, success) do
          JobStripeOps.stub(:transfer!, success) { yield }
        end
      end
    end

    def claimed_job(pay_basis: :actual_hours_worked, days: 10, start_at: 2.days.ago, end_at: 8.days.from_now)
      job = Job.create!(
        company_profile: @company_profile,
        title: "End-assignment job",
        description: "desc",
        status: :pending_funding,
        pay_basis: pay_basis,
        hourly_rate_cents: 7_500,
        hours_per_day: 8,
        days: days,
        job_timezone: "UTC",
        scheduled_start_at: start_at,
        scheduled_end_at: end_at,
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

    def submit_hours!(job, worked_hours)
      ended_at = Time.current.change(hour: 15)
      job.time_entries.create!(
        technician_profile: @tech_profile,
        submitted_by_user: @tech_user,
        worked_start_at: ended_at - worked_hours.hours,
        worked_end_at: ended_at,
        worked_on_date: ended_at.to_date,
        worked_hours: worked_hours,
        job_timezone: "UTC",
        status: :submitted
      )
    end

    def terminate!(job, actor: @company_user, reason: "project_canceled", notes: nil, effective_end_at: nil)
      result = nil
      succeed_stripe! do
        result = TerminateAssignmentService.call(
          job: job,
          actor_user: actor,
          reason: reason,
          notes: notes,
          effective_end_at: effective_end_at
        )
      end
      result
    end

    def mail_bodies
      ActionMailer::Base.deliveries.flat_map do |mail|
        if mail.multipart?
          mail.parts.map { |part| part.body.to_s }
        else
          [mail.body.to_s]
        end
      end.join("\n")
    end

    test "hours-worked jobs pay approved time and refund leftover funding" do
      job = claimed_job
      original_end = job.scheduled_end_at
      approve_hours!(job, 8)
      original_net = JobLedger.for(job).net_funded_cents

      result = terminate!(job, reason: "technician_performance")

      assert result.success?, result.error
      job.reload
      assert job.finished?
      assert job.terminated_at.present?
      assert_equal "ended_early", job.effective_status
      assert_equal "finished", job.status
      refute_includes Job.effectively_completed.ids, job.id
      assert_includes Job.effectively_ended_early.ids, job.id

      termination = job.job_termination
      assert_equal "technician_performance", termination.reason
      assert_equal 8, termination.approved_hours.to_i
      assert termination.work_performed?
      refute termination.zero_hour_termination?
      assert_equal original_end.to_i, termination.original_scheduled_end_at.to_i
      assert job.scheduled_end_at <= termination.effective_end_at

      ledger = JobLedger.for(job)
      assert_equal 60_000, ledger.labor_cents
      assert_equal JobMoney.company_charge_cents(60_000, 10), ledger.company_required_cents
      expected_refund = original_net - ledger.company_required_cents
      assert expected_refund.positive?
      assert_equal expected_refund, job.job_payment_transactions.cancellation_refund.status_succeeded.sum(:amount_cents)
      assert_equal expected_refund, termination.refund_cents
      assert_equal "settled", job.settlement_status
      assert_equal 8, job.time_entries.where(status: :approved).sum(:worked_hours)

      audit = job.job_term_change_audits.find_by(change_type: "assignment_terminated_early")
      assert audit.present?
      assert_equal @company_user.id, audit.actor_user_id
    end

    test "zero-hour hours-worked termination refunds the funded amount and reports zero labor" do
      job = claimed_job
      original_net = JobLedger.for(job).net_funded_cents

      result = terminate!(job)

      assert result.success?, result.error
      job.reload
      termination = job.job_termination
      assert termination.zero_hour_termination?
      refute termination.work_performed?
      ledger = JobLedger.for(job)
      assert_equal 0, ledger.labor_cents
      assert_equal original_net, job.job_payment_transactions.cancellation_refund.status_succeeded.sum(:amount_cents)
      assert job.payments.where(status: "refunded").exists?
      refute_includes Job.credited_work_history.ids, job.id
      assert_equal 0, MembershipPolicy.technician_completed_jobs_count(@tech_profile)
      assert_equal 0, MembershipPolicy.technician_successful_jobs_count(@tech_profile)
    end

    test "guaranteed job pay keeps the full agreed labor and does not refund unworked time" do
      job = claimed_job(pay_basis: :guaranteed_job_pay)
      approve_hours!(job, 8)
      original_labor = job.agreed_labor_cents
      original_net = JobLedger.for(job).net_funded_cents

      result = terminate!(job, reason: "staffing_need_changed")

      assert result.success?, result.error
      job.reload
      ledger = JobLedger.for(job)
      assert_equal original_labor, ledger.labor_cents
      assert_equal 0, job.job_payment_transactions.cancellation_refund.status_succeeded.sum(:amount_cents)
      assert_equal original_net, ledger.net_funded_cents
      refute job.job_termination.zero_hour_termination?
      assert_includes Job.credited_work_history.ids, job.id
      assert_equal 1, MembershipPolicy.technician_completed_jobs_count(@tech_profile)
      assert_equal 0, MembershipPolicy.technician_successful_jobs_count(@tech_profile)
    end

    test "unresolved submitted time entries block termination" do
      job = claimed_job
      approve_hours!(job, 8)
      submit_hours!(job, 4)

      result = terminate!(job)

      refute result.success?
      assert_equal :unprocessable_entity, result.status
      assert_match(/outstanding time entries/i, result.error)
      assert job.reload.filled?
      assert_nil job.terminated_at
      assert_nil job.job_termination
    end

    test "other without notes is a 422, not a 500" do
      job = claimed_job
      result = terminate!(job, reason: "other", notes: "  ")

      refute result.success?
      assert_equal :unprocessable_entity, result.status
      assert_match(/note/i, result.error)
      assert job.reload.filled?
    end

    test "unknown reasons are rejected" do
      job = claimed_job
      result = terminate!(job, reason: "not_a_reason")

      refute result.success?
      assert_equal :unprocessable_entity, result.status
      assert_match(/reason/i, result.error)
    end

    test "a second terminate is idempotent and does not double-refund" do
      job = claimed_job
      first = terminate!(job)
      assert first.success?
      refund_count = job.reload.job_payment_transactions.cancellation_refund.status_succeeded.count

      second = terminate!(job, reason: "project_completed_early")
      assert second.success?
      assert second.idempotent
      assert_equal 1, JobTermination.where(job_id: job.id).count
      assert_equal refund_count, job.reload.job_payment_transactions.status_succeeded.where(transaction_type: JobPaymentTransaction::SETTLEMENT_REFUND_TYPES).count
    end

    test "future weekend work requests after the effective end are cancelled" do
      job = claimed_job
      future = 5.days.from_now.beginning_of_day + 8.hours
      request = job.weekend_work_requests.create!(
        technician_profile: @tech_profile,
        requested_by_user: @company_user,
        status: :accepted_by_technician,
        requested_date: future.to_date,
        requested_start_at: future,
        requested_end_at: future + 8.hours,
        estimated_hours: 8,
        applicable_multiplier: 1.5
      )
      past = 2.days.ago.beginning_of_day + 8.hours
      kept = job.weekend_work_requests.create!(
        technician_profile: @tech_profile,
        requested_by_user: @company_user,
        status: :accepted_by_technician,
        requested_date: past.to_date,
        requested_start_at: past,
        requested_end_at: past + 8.hours,
        estimated_hours: 8,
        applicable_multiplier: 1.5
      )

      result = terminate!(job)
      assert result.success?, result.error
      assert_equal "cancelled", request.reload.status
      assert_equal "accepted_by_technician", kept.reload.status
    end

    test "effective end cannot be in the future" do
      job = claimed_job
      result = terminate!(job, effective_end_at: 2.hours.from_now.iso8601)

      refute result.success?
      assert_match(/cannot be in the future/i, result.error)
      assert job.reload.filled?
    end

    test "effective end cannot precede the last approved time entry" do
      job = claimed_job
      entry = approve_hours!(job, 8, ended_at: 2.hours.ago)
      result = terminate!(job, effective_end_at: (entry.worked_end_at - 1.hour).iso8601)

      refute result.success?
      assert_match(/cannot be earlier than the last approved/i, result.error)
    end

    test "open listings and finished jobs cannot be ended early" do
      listing = Job.create!(
        company_profile: @company_profile,
        title: "Open listing",
        description: "desc",
        status: :open,
        hourly_rate_cents: 5_000,
        hours_per_day: 8,
        days: 2,
        scheduled_start_at: 1.day.from_now,
        scheduled_end_at: 3.days.from_now
      )
      listing_result = terminate!(listing)
      refute listing_result.success?
      assert_match(/claimed assignment/i, listing_result.error)

      finished = claimed_job
      finished.update!(status: :finished, finished_at: Time.current)
      finished_result = terminate!(finished)
      refute finished_result.success?
      assert_match(/terminal state/i, finished_result.error)
    end

    test "technicians and other companies cannot terminate" do
      job = claimed_job
      tech_result = terminate!(job, actor: @tech_user)
      refute tech_result.success?
      assert_equal :forbidden, tech_result.status

      other_result = terminate!(job, actor: @other_company_user)
      refute other_result.success?
      assert_equal :forbidden, other_result.status
    end

    test "admins can end an assignment" do
      job = claimed_job
      result = terminate!(job, actor: @admin, reason: "safety_concern")
      assert result.success?, result.error
      assert_equal "admin", job.reload.job_termination.initiated_by_role
    end

    test "payout already released blocks termination" do
      job = claimed_job
      payment = job.payments.first
      job.job_payment_transactions.create!(
        payment: payment,
        transaction_type: :technician_transfer,
        direction: :outbound,
        amount_cents: 1_000,
        currency: "usd",
        status: :succeeded,
        idempotency_key: "xfer-#{SecureRandom.hex(8)}",
        revision: 1
      )

      result = terminate!(job)
      refute result.success?
      assert_match(/already been released/i, result.error)
    end

    test "notifications and mail are sent to both parties" do
      job = claimed_job
      result = nil
      MailDelivery.stub(:safe_deliver, ->(&block) { block&.call }) do
        result = terminate!(job, notes: "Crew no longer needed")
      end
      assert result.success?, result.error

      assert_equal 2, ActionMailer::Base.deliveries.size
      subjects = ActionMailer::Base.deliveries.map(&:subject)
      assert_includes subjects, "Assignment ended: #{job.title}"
      assert_includes subjects, "You ended the assignment for #{job.title}"
      assert_match(/ended/i, mail_bodies)

      events = AppNotification.where(category: "job_lifecycle")
      assert_equal 2, events.count
      assert events.all? { |n| n.metadata.to_h["event"] == "assignment_terminated_early" }
    end
  end
end
