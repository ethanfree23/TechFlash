require "test_helper"

module Api
  module V1
    class JobsPotentialFullTimeTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      setup do
        @company_user = User.create!(
          email: "pft-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(
          user: @company_user,
          membership_level: "premium",
          membership_fee_waived: true,
          job_funding_waived: true
        )
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @tech_user = User.create!(
          email: "pft-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        @tech_profile = TechnicianProfile.create!(
          user: @tech_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "premium"
        )
      end

      def job_payload(**overrides)
        {
          title: "Full time candidate role",
          description: "desc",
          skill_class: "Journeyman",
          scheduled_start_at: 5.days.from_now.iso8601,
          scheduled_end_at: 15.days.from_now.iso8601,
          hourly_rate_cents: 4_000,
          hours_per_day: 8,
          days: 8,
          status: "open"
        }.merge(overrides)
      end

      def create_job!(**overrides)
        Job.create!(
          {
            company_profile: @company_profile,
            title: "Job",
            description: "desc",
            status: :open,
            go_live_at: 3.days.ago,
            start_mode: :hard_start,
            scheduled_start_at: 5.days.from_now,
            scheduled_end_at: 15.days.from_now,
            hourly_rate_cents: 4_000,
            hours_per_day: 8,
            days: 8
          }.merge(overrides)
        )
      end

      test "defaults to false so existing jobs are unaffected" do
        job = create_job!
        refute job.potential_full_time?
        assert_equal({}, job.potential_full_time_details_hash)
      end

      test "company can create a job flagged as a potential full-time opportunity" do
        post "/api/v1/jobs",
             params: job_payload(potential_full_time: true),
             headers: auth_header_for(@company_user),
             as: :json

        assert_response :created
        body = JSON.parse(response.body)
        assert_equal true, body["potential_full_time"]
        assert_equal Job::POTENTIAL_FULL_TIME_DISCLAIMER, body["potential_full_time_disclaimer"]
        assert Job.find(body["id"]).potential_full_time?
      end

      test "the designation is not presented as a guaranteed offer" do
        assert_match(/not guaranteed/i, Job::POTENTIAL_FULL_TIME_DISCLAIMER)
        job = create_job!(potential_full_time: false)
        payload = JobSerializer.new(job, scope: @company_user).as_json
        assert_nil payload[:potential_full_time_disclaimer]
      end

      test "company can toggle the designation on an existing job" do
        job = create_job!

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: true },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :ok
        assert job.reload.potential_full_time?

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: false },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :ok
        refute job.reload.potential_full_time?
      end

      test "forward-compatible details survive a round trip" do
        details = { "role_title" => "Lead HVAC Installer", "salary_range" => "70000-85000" }

        patch "/api/v1/jobs/#{create_job!.id}",
              params: { potential_full_time: true, potential_full_time_details: details },
              headers: auth_header_for(@company_user),
              as: :json

        assert_response :ok
        assert_equal details, JSON.parse(response.body)["potential_full_time_details"]
      end

      test "technicians see the designation on job details" do
        job = create_job!(potential_full_time: true)

        get "/api/v1/jobs/#{job.id}", headers: auth_header_for(@tech_user), as: :json

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["potential_full_time"]
        assert_equal Job::POTENTIAL_FULL_TIME_DISCLAIMER, body["potential_full_time_disclaimer"]
      end

      test "technicians can filter job discovery by potential full-time" do
        flagged = create_job!(title: "Flagged role", potential_full_time: true)
        plain = create_job!(title: "Plain role")

        get "/api/v1/jobs",
            params: { potential_full_time: true, page: 1 },
            headers: auth_header_for(@tech_user)

        assert_response :ok
        ids = JSON.parse(response.body)["jobs"].map { |j| j["id"] }
        assert_includes ids, flagged.id
        refute_includes ids, plain.id
      end

      test "omitting the filter returns both flagged and unflagged jobs" do
        flagged = create_job!(title: "Flagged role", potential_full_time: true)
        plain = create_job!(title: "Plain role")

        get "/api/v1/jobs", params: { page: 1 }, headers: auth_header_for(@tech_user)

        assert_response :ok
        ids = JSON.parse(response.body)["jobs"].map { |j| j["id"] }
        assert_includes ids, flagged.id
        assert_includes ids, plain.id
      end

      test "the designation persists through a claim" do
        job = create_job!(potential_full_time: true)
        JobFundingService.snapshot_company!(job)
        job.update!(funding_status: :funded)

        patch "/api/v1/jobs/#{job.id}/claim", headers: auth_header_for(@tech_user), as: :json

        assert_response :ok
        assert job.reload.filled?
        assert job.potential_full_time?
        assert_equal true, JSON.parse(response.body)["potential_full_time"]
      end

      test "schedule flexibility defaults to flexible start and is settable" do
        job = create_job!
        assert job.schedule_flexible_start?
        assert_nil job.hard_end_boundary_at

        patch "/api/v1/jobs/#{job.id}",
              params: { schedule_flexibility: "hard_end" },
              headers: auth_header_for(@company_user),
              as: :json

        assert_response :ok
        assert_equal "hard_end", JSON.parse(response.body)["schedule_flexibility"]
        assert_equal job.reload.scheduled_end_at, job.hard_end_boundary_at
      end

      test "hard_end_boundary_at prefers an explicit hard deadline" do
        deadline = 12.days.from_now.change(usec: 0)
        job = create_job!(schedule_flexibility: :hard_end, hard_deadline_at: deadline)

        assert_equal deadline, job.hard_end_boundary_at
      end
    end
  end
end
