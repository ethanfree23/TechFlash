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
        assert_equal 1, job.job_applications.where(status: :accepted).count
        assert_equal({}, job.potential_full_time_details_hash)
      end

      test "potential full-time filter paginates the filtered set, not the unfiltered set" do
        3.times { |i| create_job!(title: "PFT page #{i}", potential_full_time: true) }
        4.times { |i| create_job!(title: "Plain page #{i}", potential_full_time: false) }

        get "/api/v1/jobs",
            params: { potential_full_time: true, page: 1, per_page: 2 },
            headers: auth_header_for(@tech_user)
        assert_response :ok
        page1 = JSON.parse(response.body)
        ids1 = page1["jobs"].map { |j| j["id"] }
        assert_equal 2, ids1.length
        assert_equal 3, page1["meta"]["total"]
        assert_equal 2, page1["meta"]["total_pages"]
        assert page1["jobs"].all? { |j| j["potential_full_time"] == true }

        get "/api/v1/jobs",
            params: { potential_full_time: true, page: 2, per_page: 2 },
            headers: auth_header_for(@tech_user)
        assert_response :ok
        page2 = JSON.parse(response.body)
        ids2 = page2["jobs"].map { |j| j["id"] }
        assert_equal 1, ids2.length
        assert_empty ids1 & ids2
        assert page2["jobs"].all? { |j| j["potential_full_time"] == true }
        refute page1["jobs"].any? { |j| j["potential_full_time"] == false }
        refute page2["jobs"].any? { |j| j["potential_full_time"] == false }
      end

      test "potential full-time filter can return an empty page" do
        create_job!(title: "Only a plain job", potential_full_time: false)

        get "/api/v1/jobs",
            params: { potential_full_time: true, page: 1, per_page: 9, location: "No Such City, ZZ" },
            headers: auth_header_for(@tech_user)

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal [], body["jobs"]
        assert_equal 0, body["meta"]["total"]
      end

      test "potential full-time filter combines with location before pagination" do
        match = create_job!(title: "PFT Houston", potential_full_time: true, location: "Houston, TX")
        create_job!(title: "PFT Dallas", potential_full_time: true, location: "Dallas, TX")
        create_job!(title: "Plain Houston", potential_full_time: false, location: "Houston, TX")

        get "/api/v1/jobs",
            params: { potential_full_time: true, location: "Houston, TX", page: 1, per_page: 9 },
            headers: auth_header_for(@tech_user)

        assert_response :ok
        ids = JSON.parse(response.body)["jobs"].map { |j| j["id"] }
        assert_equal [match.id], ids
      end

      test "technicians cannot change the designation" do
        job = create_job!(potential_full_time: false)

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: true },
              headers: auth_header_for(@tech_user),
              as: :json

        assert_response :forbidden
        refute job.reload.potential_full_time?
      end

      test "a company cannot change another company's designation" do
        job = create_job!(potential_full_time: false)
        other_user = User.create!(
          email: "pft-other-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        other_profile = CompanyProfile.create!(
          user: other_user,
          membership_level: "premium",
          membership_fee_waived: true,
          job_funding_waived: true
        )
        other_user.update_column(:company_profile_id, other_profile.id)

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: true },
              headers: auth_header_for(other_user),
              as: :json

        assert_response :forbidden
        refute job.reload.potential_full_time?
      end

      test "unauthenticated callers cannot change the designation" do
        job = create_job!(potential_full_time: false)

        patch "/api/v1/jobs/#{job.id}", params: { potential_full_time: true }, as: :json

        assert_response :unauthorized
        refute job.reload.potential_full_time?
      end

      test "toggling the designation does not change pay, schedule, or claim state" do
        job = create_job!(
          potential_full_time: false,
          hourly_rate_cents: 4_500,
          hours_per_day: 8,
          days: 6,
          pay_basis: :guaranteed_job_pay
        )
        JobFundingService.snapshot_company!(job)
        job.update!(funding_status: :funded)

        fingerprint = lambda do |record|
          {
            hourly_rate_cents: record.hourly_rate_cents,
            hours_per_day: record.hours_per_day,
            days: record.days,
            price_cents: record.price_cents,
            pay_basis: record.pay_basis,
            job_amount_cents: record.job_amount_cents,
            company_charge_cents: record.company_charge_cents,
            tech_payout_cents: record.tech_payout_cents,
            funding_status: record.funding_status,
            scheduled_start_at: record.scheduled_start_at,
            scheduled_end_at: record.scheduled_end_at,
            status: record.status,
            claimed_technician_id: record.job_applications.accepted.first&.technician_profile_id
          }
        end
        before = fingerprint.call(job)

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: true },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :ok
        job.reload
        assert job.potential_full_time?
        assert_equal before, fingerprint.call(job)

        patch "/api/v1/jobs/#{job.id}",
              params: { potential_full_time: false },
              headers: auth_header_for(@company_user),
              as: :json
        assert_response :ok
        job.reload
        refute job.potential_full_time?
        assert_equal before, fingerprint.call(job)
      end

      test "identical PFT and non-PFT jobs produce the same funding snapshot" do
        pft = create_job!(title: "PFT twin", potential_full_time: true, hourly_rate_cents: 4_000, hours_per_day: 8, days: 8)
        plain = create_job!(title: "Plain twin", potential_full_time: false, hourly_rate_cents: 4_000, hours_per_day: 8, days: 8)

        JobFundingService.snapshot_company!(pft)
        JobFundingService.snapshot_company!(plain)
        pft.save!
        plain.save!

        assert_equal plain.job_amount_cents, pft.job_amount_cents
        assert_equal plain.company_charge_cents, pft.company_charge_cents
        assert_equal plain.tech_payout_cents, pft.tech_payout_cents
        assert_equal plain.company_commission_percent, pft.company_commission_percent
        assert_equal plain.hourly_rate_cents, pft.hourly_rate_cents
        assert_equal plain.price_cents, pft.price_cents
      end

      test "finished jobs retain the original designation" do
        job = create_job!(potential_full_time: true)
        job.update!(status: :finished, finished_at: Time.current)

        get "/api/v1/jobs/#{job.id}", headers: auth_header_for(@company_user), as: :json
        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal true, body["potential_full_time"]
        assert_equal Job::POTENTIAL_FULL_TIME_DISCLAIMER, body["potential_full_time_disclaimer"]
        assert job.reload.potential_full_time?
        assert job.finished?
      end

      test "malformed potential_full_time_details are normalized to an empty hash" do
        job = create_job!
        job.assign_attributes(potential_full_time: true, potential_full_time_details: ["not", "a", "hash"])
        assert job.save
        assert_equal({}, job.reload.potential_full_time_details_hash)
      end

      test "a potential full-time job still goes through schedule conflict detection" do
        monday = Date.new(2027, 3, 1)
        start_at = Time.find_zone!("UTC").local(monday.year, monday.month, monday.day, 8, 0, 0)
        end_at = Time.find_zone!("UTC").local(monday.year, monday.month, monday.day + 11, 17, 0, 0)
        claimed = create_job!(
          title: "Already claimed",
          scheduled_start_at: start_at,
          scheduled_end_at: end_at,
          days: 10,
          standard_work_days: [1, 2, 3, 4, 5]
        )
        JobFundingService.snapshot_company!(claimed)
        claimed.update!(funding_status: :funded)
        JobApplication.create!(job: claimed, technician_profile: @tech_profile, status: :accepted)
        claimed.update!(status: :filled)

        overlapping = create_job!(
          title: "Overlapping PFT",
          potential_full_time: true,
          scheduled_start_at: start_at,
          scheduled_end_at: end_at,
          days: 10,
          standard_work_days: [1, 2, 3, 4, 5]
        )
        JobFundingService.snapshot_company!(overlapping)
        overlapping.update!(funding_status: :funded)

        detector = Schedule::ConflictDetector.call(technician_profile: @tech_profile.reload, job: overlapping)
        assert detector.conflict?

        patch "/api/v1/jobs/#{overlapping.id}/claim", headers: auth_header_for(@tech_user), as: :json
        assert_response :conflict
        body = JSON.parse(response.body)
        assert_equal true, body["schedule_conflict"]
        assert overlapping.reload.open?
        assert overlapping.potential_full_time?
        assert_nil overlapping.job_applications.find_by(technician_profile: @tech_profile, status: :accepted)
      end

      test "potential_full_time is not consulted by claim eligibility" do
        ineligible_source = File.read(Rails.root.join("app/services/jobs/claim_job_service.rb")) +
                            File.read(Rails.root.join("app/services/membership_policy.rb")) +
                            File.read(Rails.root.join("app/services/verification_eligibility_service.rb"))
        refute_includes ineligible_source, "potential_full_time"
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
