# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class JobTerminationFlowTest < ActionDispatch::IntegrationTest
      include AuthTestHelper
      include ActiveSupport::Testing::TimeHelpers

      setup do
        @company_user = User.create!(
          email: "flow-term-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @tech_user = User.create!(
          email: "flow-term-tech-#{SecureRandom.hex(4)}@example.com",
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
          email: "flow-term-other-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        other_profile = CompanyProfile.create!(user: @other_company_user, membership_level: "basic")
        @other_company_user.update_column(:company_profile_id, other_profile.id)

        @admin = User.create!(
          email: "flow-term-admin-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
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
          title: "Flow terminate job",
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

      def approve_hours!(job, worked_hours)
        ended_at = 1.day.ago.change(hour: 16)
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
      end

      def terminate_via_api!(job, user: @company_user, reason: "project_canceled", notes: nil)
        payload = { reason: reason }
        payload[:notes] = notes if notes
        response = nil
        succeed_stripe! do
          patch "/api/v1/jobs/#{job.id}/terminate",
                params: payload,
                headers: auth_header_for(user),
                as: :json
          response = @response
        end
        response
      end

      test "company can preview and then end an assignment" do
        job = claimed_job
        approve_hours!(job, 8)

        get "/api/v1/jobs/#{job.id}/termination_preview", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        preview = JSON.parse(response.body)["termination_preview"]
        assert_equal true, preview["terminable"]
        assert_equal 8.0, preview.dig("time_entries", "approved_hours")
        assert preview["reasons"].any? { |row| row["value"] == "other" }

        terminate_via_api!(job, reason: "company_schedule_changed")
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "ended_early", body.dig("job", "effective_status")
        assert_equal true, body.dig("job", "ended_early")
        assert_equal "company_schedule_changed", body.dig("termination", "reason")
        assert_equal false, body["idempotent"]

        get "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        shown = JSON.parse(response.body)
        shown = shown["job"] if shown.key?("job")
        assert_equal "ended_early", shown["effective_status"]
        assert shown["termination"].present?
        assert (shown["timeline_events"] || []).any? { |event| event["key"] == "ended_early" }
      end

      test "technician and other companies cannot preview or terminate" do
        job = claimed_job

        get "/api/v1/jobs/#{job.id}/termination_preview", headers: auth_header_for(@tech_user), as: :json
        assert_response :forbidden

        get "/api/v1/jobs/#{job.id}/termination_preview", headers: auth_header_for(@other_company_user), as: :json
        assert_response :forbidden

        terminate_via_api!(job, user: @tech_user)
        assert_response :forbidden

        terminate_via_api!(job, user: @other_company_user)
        assert_response :forbidden
      end

      test "admin can terminate" do
        job = claimed_job
        terminate_via_api!(job, user: @admin, reason: "safety_concern")
        assert_response :ok
        assert_equal "admin", JSON.parse(response.body).dig("termination", "initiated_by_role")
      end

      test "company dashboard buckets ended-early separately from completed" do
        ended = claimed_job
        terminate_via_api!(ended)
        assert_response :ok

        completed = claimed_job
        completed.update!(status: :finished, finished_at: Time.current, terminated_at: nil)

        get "/api/v1/dashboard/jobs", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        payload = JSON.parse(response.body)
        assert_equal 1, payload.dig("counts", "ended_early")
        assert_includes payload["ended_early"].map { |row| row["id"] }, ended.id
        refute_includes payload["ended_early"].map { |row| row["id"] }, completed.id
        assert_includes payload["completed"].map { |row| row["id"] }, completed.id
        refute_includes payload["completed"].map { |row| row["id"] }, ended.id
      end

      test "technician history can filter ended_early separately from completed" do
        ended = claimed_job
        terminate_via_api!(ended)
        assert_response :ok

        completed = claimed_job
        completed.update!(status: :finished, finished_at: Time.current, terminated_at: nil)

        get "/api/v1/jobs", params: { status: "ended_early" }, headers: auth_header_for(@tech_user), as: :json
        assert_response :ok
        ended_ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes ended_ids, ended.id
        refute_includes ended_ids, completed.id

        get "/api/v1/jobs", params: { status: "completed" }, headers: auth_header_for(@tech_user), as: :json
        assert_response :ok
        completed_ids = JSON.parse(response.body).map { |row| row["id"] }
        assert_includes completed_ids, completed.id
        refute_includes completed_ids, ended.id

        get "/api/v1/dashboard/technician_jobs", headers: auth_header_for(@tech_user), as: :json
        assert_response :ok
        dash = JSON.parse(response.body)
        row = dash["completed"].find { |job| job["id"] == ended.id }
        assert row.present?
        assert_equal true, row["ended_early"]
        assert_equal "ended_early", row["effective_status"]
      end

      test "deny is blocked once approved hours exist and End Assignment is required" do
        job = claimed_job
        approve_hours!(job, 8)

        patch "/api/v1/jobs/#{job.id}/deny", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert_match(/End Assignment/, JSON.parse(response.body)["error"])
        assert job.reload.filled?
      end

      test "deny still works when no approved hours exist" do
        job = claimed_job
        patch "/api/v1/jobs/#{job.id}/deny", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        assert job.reload.open?
        assert_nil job.job_applications.find_by(status: :accepted)
      end

      test "reviews remain available after an assignment is ended early" do
        job = claimed_job
        terminate_via_api!(job)
        assert_response :ok

        post "/api/v1/ratings",
             params: {
               job_id: job.id,
               category_scores: Rating::COMPANY_REVIEW_CATEGORIES.keys.index_with { 5 },
               comment: "Reliable, high-quality work, strong communication, and followed all safety protocols during the full shift.",
               would_hire_again: true,
               would_recommend: true,
               on_time_status: "on_time",
               request_again: true
             },
             headers: auth_header_for(@company_user),
             as: :json

        assert_response :created
        assert_equal 1, Rating.where(job_id: job.id, reviewer: @company_profile).count
      end

      test "new time entries are rejected after the assignment is ended" do
        job = claimed_job
        terminate_via_api!(job)
        assert_response :ok

        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               worked_start_at: 2.hours.ago.iso8601,
               worked_end_at: Time.current.iso8601,
               worked_on_date: Date.current,
               worked_hours: 2
             },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :unprocessable_entity
        assert_match(/ended early/i, JSON.parse(response.body)["error"])
      end

      test "other without notes is unprocessable" do
        job = claimed_job
        terminate_via_api!(job, reason: "other", notes: "")
        assert_response :unprocessable_entity
        assert_match(/note/i, JSON.parse(response.body)["error"])
      end

      test "finish is refused after an early end" do
        job = claimed_job
        terminate_via_api!(job)
        assert_response :ok

        patch "/api/v1/jobs/#{job.id}/finish", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert_match(/already ended early/i, JSON.parse(response.body)["error"])
      end

      test "repeating terminate is idempotent" do
        job = claimed_job
        terminate_via_api!(job)
        assert_response :ok
        first_id = JSON.parse(response.body).dig("termination", "id")

        terminate_via_api!(job, reason: "project_completed_early")
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["idempotent"]
        assert_equal first_id, body.dig("termination", "id")
      end
    end
  end
end
