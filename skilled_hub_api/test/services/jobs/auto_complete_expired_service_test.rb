# frozen_string_literal: true

require "test_helper"

module Jobs
  class AutoCompleteExpiredServiceTest < ActiveSupport::TestCase
    include ActiveSupport::Testing::TimeHelpers

    setup do
      @company_user = User.create!(email: "auto-co-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
      @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
      @company_user.update_column(:company_profile_id, @company_profile.id)
      @tech_user = User.create!(email: "auto-tech-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
      @tech_profile = TechnicianProfile.create!(
        user: @tech_user, trade_type: "General", availability: "Full-time", membership_level: "basic",
        stripe_account_id: "acct_test", stripe_charges_enabled: true, stripe_payouts_enabled: true,
        stripe_details_submitted: true, stripe_transfers_capability_status: "active"
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

    def claimed_job(end_at:, start_at: nil, pay_basis: :actual_hours_worked)
      job = Job.create!(
        company_profile: @company_profile, title: "Auto-complete job", description: "desc",
        status: :pending_funding, pay_basis: pay_basis, hourly_rate_cents: 7_500,
        hours_per_day: 8, days: 2, job_timezone: "UTC",
        scheduled_start_at: start_at || (end_at - 2.days), scheduled_end_at: end_at,
        go_live_at: 6.days.ago
      )
      succeed_stripe! { JobFundingService.fund_for_publish!(job) }
      JobFundingService.snapshot_technician!(job, @tech_profile)
      JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
      job.update!(status: :filled)
      job.reload
    end

    def approve_hours!(job, worked_hours)
      ended_at = 1.day.ago.change(hour: 16)
      entry = job.time_entries.create!(
        technician_profile: @tech_profile, submitted_by_user: @tech_user,
        worked_start_at: ended_at - worked_hours.hours, worked_end_at: ended_at,
        worked_on_date: ended_at.to_date, worked_hours: worked_hours, job_timezone: "UTC", status: :approved
      )
      entry.create_time_entry_pay_line!(
        job: job, base_hourly_rate_cents: job.hourly_rate_cents, applied_multiplier: 1,
        effective_hourly_rate_cents: job.hourly_rate_cents, worked_hours: worked_hours,
        gross_pay_cents: (job.hourly_rate_cents * worked_hours).to_i,
        premium_combination_rule: :highest_applicable
      )
    end

    test "GET requests no longer auto-complete expired assignments" do
      job = claimed_job(end_at: 2.days.ago)
      approve_hours!(job, 8)

      refute Job.respond_to?(:auto_complete_expired!), "the bulk mutator must not exist on Job"
      assert_includes Job.due_for_auto_completion.ids, job.id
      assert_equal "filled", job.reload.status
      assert_nil job.finished_at
    end

    test "the explicit service finishes overdue in-progress jobs and then settles them" do
      job = claimed_job(end_at: 2.days.ago)
      approve_hours!(job, 8)

      result = nil
      succeed_stripe! { result = AutoCompleteExpiredService.call }

      assert_equal 1, result[:completed]
      assert_includes result[:completed_job_ids], job.id
      job.reload
      assert job.finished?
      assert job.finished_at.present?
      refute job.terminated_early?
      assert_equal "completed", job.effective_status
      assert_equal "settled", job.settlement_status
    end

    test "an assignment that was ended early is not auto-completed again" do
      job = claimed_job(end_at: 2.days.ago)
      approve_hours!(job, 8)
      succeed_stripe! do
        TerminateAssignmentService.call(job: job, actor_user: @company_user, reason: "project_canceled")
      end
      original_terminated_at = job.reload.terminated_at
      original_finished_at = job.finished_at

      result = AutoCompleteExpiredService.call

      assert_equal 0, result[:completed]
      job.reload
      assert_equal original_terminated_at.to_i, job.terminated_at.to_i
      assert_equal original_finished_at.to_i, job.finished_at.to_i
      assert_equal "ended_early", job.effective_status
    end

    test "a still-running assignment whose end is in the future is left alone" do
      job = claimed_job(end_at: 3.days.from_now)
      approve_hours!(job, 8)

      result = AutoCompleteExpiredService.call

      assert_equal 0, result[:completed]
      assert job.reload.filled?
    end

    test "open listings whose end has passed are not finished as assignments" do
      listing = Job.create!(
        company_profile: @company_profile, title: "Expired listing", description: "desc",
        status: :open, hourly_rate_cents: 5_000, hours_per_day: 8, days: 2,
        scheduled_start_at: 5.days.ago, scheduled_end_at: 1.day.ago, go_live_at: 6.days.ago
      )

      result = AutoCompleteExpiredService.call

      assert_equal 0, result[:completed]
      assert listing.reload.open?
      assert_equal "expired", listing.effective_status
    end

    test "PaymentsReleaseRunner auto-completes overdue jobs before attempting payouts" do
      job = claimed_job(end_at: 4.days.ago)
      approve_hours!(job, 8)

      result = nil
      succeed_stripe! { result = PaymentsReleaseRunner.call }

      assert_equal 1, result.dig(:auto_completed, :completed)
      assert job.reload.finished?
    end
  end
end
