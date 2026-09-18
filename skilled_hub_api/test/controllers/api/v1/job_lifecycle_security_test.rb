# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class JobLifecycleSecurityTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      setup do
        @company_user = User.create!(
          email: "sec-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic", phone: "713-555-0100")
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @tech_user = User.create!(
          email: "sec-tech-#{SecureRandom.hex(4)}@example.com",
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

        @outsider = User.create!(
          email: "sec-out-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: @outsider,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
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

      def funded_open_job
        job = Job.create!(
          company_profile: @company_profile,
          title: "Security job",
          description: "desc",
          status: :pending_funding,
          pay_basis: :actual_hours_worked,
          hourly_rate_cents: 7_500,
          hours_per_day: 8,
          days: 2,
          job_timezone: "UTC",
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 3.days.from_now,
          go_live_at: Time.current
        )
        succeed_stripe! { JobFundingService.fund_for_publish!(job) }
        job.reload
      end

      def claimed_job
        job = funded_open_job
        JobFundingService.snapshot_technician!(job, @tech_profile)
        JobApplication.create!(job: job, technician_profile: @tech_profile, status: :accepted)
        job.update!(status: :filled)
        job.reload
      end

      test "status cannot be mass-assigned to finished or filled" do
        job = funded_open_job

        patch "/api/v1/jobs/#{job.id}",
              params: { status: "finished" },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :unprocessable_entity
        assert_match(/cannot be changed/, JSON.parse(response.body)["error"])
        refute job.reload.finished?

        patch "/api/v1/jobs/#{job.id}",
              params: { status: "filled" },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :unprocessable_entity
        refute job.reload.filled?
      end

      test "funded jobs cannot be deleted" do
        job = funded_open_job
        delete "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert Job.exists?(job.id)
        body = JSON.parse(response.body)
        assert_match(/payment activity|funded/i, body["error"])
      end

      test "claimed jobs cannot be deleted" do
        job = claimed_job
        delete "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert Job.exists?(job.id)
      end

      test "jobs with time entries cannot be deleted" do
        job = claimed_job
        job.time_entries.create!(
          technician_profile: @tech_profile,
          submitted_by_user: @tech_user,
          worked_start_at: 3.hours.ago,
          worked_end_at: 1.hour.ago,
          worked_on_date: Date.current,
          worked_hours: 2,
          job_timezone: "UTC",
          status: :submitted
        )

        delete "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert_match(/time entries/i, JSON.parse(response.body)["error"])
        assert Job.exists?(job.id)
      end

      test "ended-early and finished jobs cannot be deleted" do
        job = claimed_job
        job.update!(status: :finished, finished_at: Time.current, terminated_at: Time.current)

        delete "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :unprocessable_entity
        assert_match(/Ended assignments/i, JSON.parse(response.body)["error"])
      end

      test "application create always starts as requested even if accepted is posted" do
        job = funded_open_job
        post "/api/v1/job_applications",
             params: { job_id: job.id, status: "accepted", notes: "please hire me" },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        created = JobApplication.find(JSON.parse(response.body)["id"])
        assert_equal "requested", created.status
      end

      test "accepted claims cannot be mutated or destroyed through the application API" do
        job = claimed_job
        application = job.job_applications.find_by!(status: :accepted)

        patch "/api/v1/job_applications/#{application.id}",
              params: { notes: "changed", status: "rejected" },
              headers: auth_header_for(@tech_user),
              as: :json
        assert_response :unprocessable_entity
        assert_match(/cannot be changed/i, JSON.parse(response.body)["error"])
        assert_equal "accepted", application.reload.status

        delete "/api/v1/job_applications/#{application.id}",
               headers: auth_header_for(@tech_user),
               as: :json
        assert_response :unprocessable_entity
        assert JobApplication.exists?(application.id)
      end

      test "application update permits notes only" do
        job = funded_open_job
        application = JobApplication.create!(job: job, technician_profile: @tech_profile, status: :requested)

        patch "/api/v1/job_applications/#{application.id}",
              params: { notes: "updated availability", status: "accepted" },
              headers: auth_header_for(@tech_user),
              as: :json
        assert_response :ok
        application.reload
        assert_equal "requested", application.status
        assert_equal "updated availability", application.notes
      end

      test "legacy application accept is gone" do
        job = funded_open_job
        application = JobApplication.create!(job: job, technician_profile: @tech_profile, status: :requested)

        patch "/api/v1/job_applications/#{application.id}/accept",
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :gone
        assert_equal "requested", application.reload.status
      end

      test "application deny refuses an accepted claim" do
        job = claimed_job
        application = job.job_applications.find_by!(status: :accepted)

        patch "/api/v1/job_applications/#{application.id}/deny",
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :unprocessable_entity
        assert_match(/claimed the job/i, JSON.parse(response.body)["error"])
        assert_equal "accepted", application.reload.status
      end

      test "outsiders cannot log time on a claimed job" do
        job = claimed_job
        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               worked_start_at: 3.hours.ago.iso8601,
               worked_end_at: 1.hour.ago.iso8601,
               worked_on_date: Date.current,
               worked_hours: 2
             },
             headers: auth_header_for(@outsider),
             as: :json

        assert_response :forbidden
      end

      test "technicians cannot set override flags or another technician id" do
        job = claimed_job
        other_tech = @outsider.technician_profile

        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               technician_profile_id: other_tech.id,
               override_applied: true,
               override_reason: "bypass",
               worked_start_at: Time.current.change(hour: 8).iso8601,
               worked_end_at: Time.current.change(hour: 16).iso8601,
               worked_on_date: Date.current,
               worked_hours: 8
             },
             headers: auth_header_for(@tech_user),
             as: :json

        assert_response :created
        entry = job.time_entries.order(:id).last
        assert_equal @tech_profile.id, entry.technician_profile_id
        refute entry.override_applied?
      end

      test "time cannot be logged on an unclaimed job" do
        job = funded_open_job
        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               worked_start_at: 3.hours.ago.iso8601,
               worked_end_at: 1.hour.ago.iso8601,
               worked_on_date: Date.current,
               worked_hours: 2
             },
             headers: auth_header_for(@company_user),
             as: :json

        assert_response :unprocessable_entity
        assert_match(/claimed/i, JSON.parse(response.body)["error"])
      end

      test "GET job reads do not auto-complete overdue assignments" do
        job = claimed_job
        job.update!(scheduled_end_at: 2.days.ago)

        get "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        assert_equal "filled", job.reload.status
        assert_nil job.finished_at

        get "/api/v1/public/jobs/#{job.share_token}", as: :json
        assert_response :ok
        assert_equal "filled", job.reload.status
      end
    end
  end
end
