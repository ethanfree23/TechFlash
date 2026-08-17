# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class JobStatusConsistencyTest < ActionDispatch::IntegrationTest
      include AuthTestHelper
      include ActiveSupport::Testing::TimeHelpers

      setup do
        @admin = User.create!(
          email: "status-admin-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        )
        @company_user = User.create!(
          email: "status-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(
          user: @company_user,
          membership_level: "premium",
          membership_fee_waived: true
        )
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @tech_user = User.create!(
          email: "status-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        @tech_profile = TechnicianProfile.create!(
          user: @tech_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )
      end

      def create_job(attrs = {})
        Job.create!({
          company_profile: @company_profile,
          title: "Consistency job #{SecureRandom.hex(4)}",
          description: "desc",
          status: :open,
          hourly_rate_cents: 5_000,
          hours_per_day: 8,
          days: 2,
          go_live_at: 5.days.ago,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 3.days.from_now
        }.merge(attrs))
      end

      def admin_job_ids(status:)
        get "/api/v1/jobs?status=#{status}&page=1&per_page=100",
            headers: auth_header_for(@admin),
            as: :json
        assert_response :ok
        body = response.parsed_body
        (body["jobs"] || []).map { |row| row["id"] }
      end

      test "effective open and expired populations match filters, KPIs, and serializer" do
        open_job = create_job(scheduled_end_at: 2.days.from_now)
        expired_jobs = Array.new(3) { create_job(scheduled_end_at: 2.days.ago) }
        completed = create_job(status: :finished, scheduled_start_at: 5.days.ago, scheduled_end_at: 2.days.ago, finished_at: 1.day.ago)
        claimed = create_job(status: :filled, scheduled_start_at: 2.days.from_now, scheduled_end_at: 5.days.from_now)
        counter_job = create_job(scheduled_end_at: 4.days.from_now)
        JobCounterOffer.create!(
          job: counter_job,
          technician_profile: @tech_profile,
          company_profile: @company_profile,
          status: :pending_company,
          created_by_role: :technician,
          proposed_hourly_rate_cents: 6_000,
          proposed_hours_per_day: 8,
          proposed_days: 2,
          proposed_start_mode: :rolling_start
        )

        assert_equal "open", open_job.effective_status
        expired_jobs.each { |job| assert_equal "expired", job.effective_status }
        assert_equal "completed", completed.effective_status
        assert_equal "claimed", claimed.effective_status
        assert_equal "open", counter_job.effective_status

        counts = Jobs::StatusCounts.for(Job.all)

        get "/api/v1/dashboard/analytics", headers: auth_header_for(@admin), as: :json
        assert_response :ok
        analytics = response.parsed_body
        assert_equal counts[:open], analytics["jobs_open"]
        assert_equal counts[:expired], analytics["jobs_expired"]
        assert_equal counts[:claimed], analytics["jobs_in_progress"]
        assert_equal counts[:completed], analytics["jobs_finished"]
        assert_equal counts[:counter_pending], analytics["jobs_counter_pending"]
        assert_equal counts[:total], analytics["total_jobs"]

        open_ids = admin_job_ids(status: "open")
        expired_ids = admin_job_ids(status: "expired")

        assert_equal Job.effectively_open.order(:id).pluck(:id), open_ids.sort
        assert_equal Job.expired_listings.order(:id).pluck(:id), expired_ids.sort
        assert_equal counts[:open], open_ids.size
        assert_equal counts[:expired], expired_ids.size
        assert_includes open_ids, open_job.id
        assert_includes open_ids, counter_job.id
        expired_jobs.each { |job| refute_includes open_ids, job.id }
        expired_jobs.each { |job| assert_includes expired_ids, job.id }
        refute_includes expired_ids, open_job.id
        refute_includes open_ids, completed.id
        refute_includes open_ids, claimed.id

        get "/api/v1/jobs/#{open_job.id}", headers: auth_header_for(@admin), as: :json
        assert_response :ok
        assert_equal "open", response.parsed_body["effective_status"]
        assert_equal "open", response.parsed_body["status"]

        get "/api/v1/jobs/#{expired_jobs.first.id}", headers: auth_header_for(@admin), as: :json
        assert_response :ok
        assert_equal "expired", response.parsed_body["effective_status"]
        assert_equal "open", response.parsed_body["status"]
      end

      test "KPI open count is not derived from a single page of jobs" do
        5.times { create_job(scheduled_end_at: 2.days.from_now) }
        3.times { create_job(scheduled_end_at: 2.days.ago) }

        counts = Jobs::StatusCounts.for(Job.all)
        get "/api/v1/jobs?status=open&page=1&per_page=2",
            headers: auth_header_for(@admin),
            as: :json
        assert_response :ok
        page = response.parsed_body
        assert_equal 2, page["jobs"].size
        assert_equal counts[:open], page["meta"]["total"]
        assert_operator page["meta"]["total"], :>, page["jobs"].size

        get "/api/v1/dashboard/analytics", headers: auth_header_for(@admin), as: :json
        assert_equal counts[:open], response.parsed_body["jobs_open"]
        assert_equal counts[:expired], response.parsed_body["jobs_expired"]
      end

      test "claim and counter-offer reject expired listings" do
        job = create_job(scheduled_end_at: 1.day.ago)

        patch "/api/v1/jobs/#{job.id}/claim",
              headers: auth_header_for(@tech_user),
              as: :json
        assert_response :unprocessable_entity
        assert_equal "Job is no longer available", response.parsed_body["error"]
        assert_equal "open", job.reload.status

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: {
               proposed_hourly_rate_cents: 6_000,
               proposed_hours_per_day: 8,
               proposed_days: 2
             },
             headers: auth_header_for(@tech_user),
             as: :json
        assert_response :unprocessable_entity
        assert_equal "Job is no longer available", response.parsed_body["error"]
      end

      test "technician marketplace open browse excludes expired listings" do
        open_job = create_job(scheduled_end_at: 2.days.from_now)
        expired = create_job(scheduled_end_at: 2.days.ago)

        get "/api/v1/jobs?status=open&page=1&per_page=100",
            headers: auth_header_for(@tech_user),
            as: :json
        assert_response :ok
        ids = (response.parsed_body["jobs"] || []).map { |row| row["id"] }
        assert_includes ids, open_job.id
        refute_includes ids, expired.id
      end

      test "in_progress filter matches claimed KPI population" do
        upcoming = create_job(status: :filled, scheduled_start_at: 2.days.from_now, scheduled_end_at: 5.days.from_now)
        started = create_job(status: :filled, scheduled_start_at: 1.day.ago, scheduled_end_at: 2.days.from_now)

        ids = admin_job_ids(status: "in_progress")
        assert_includes ids, upcoming.id
        assert_includes ids, started.id
        assert_equal Job.in_progress.order(:id).pluck(:id), ids.sort
      end
    end
  end
end
