require "test_helper"

module Api
  module V1
    class JobCounterOffersControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def create_company_with_job
        company_user = User.create!(
          email: "company-counter-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(
          user: company_user,
          membership_level: "premium",
          membership_fee_waived: true,
          job_funding_waived: true
        )
        company_user.update_column(:company_profile_id, company_profile.id)
        job = Job.create!(
          company_profile: company_profile,
          title: "Counter test job",
          description: "desc",
          status: :open,
          go_live_at: 3.days.ago,
          start_mode: :hard_start,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now,
          hourly_rate_cents: 3000,
          hours_per_day: 8,
          days: 5
        )
        JobFundingService.snapshot_company!(job)
        job.update!(funding_status: :funded)
        [company_user, company_profile, job]
      end

      def create_technician
        tech_user = User.create!(
          email: "tech-counter-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        profile = TechnicianProfile.create!(
          user: tech_user,
          trade_type: "General",
          availability: "Full-time",
          membership_level: "basic"
        )
        [tech_user, profile]
      end

      test "technician can create counter offer and company can accept to claim job" do
        company_user, _company_profile, job = create_company_with_job
        tech_user, tech_profile = create_technician

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: {
               proposed_hourly_rate_cents: 3400,
               proposed_hours_per_day: 8,
               proposed_days: 7,
               proposed_start_mode: "rolling_start"
             },
             headers: auth_header_for(tech_user),
             as: :json

        assert_response :created
        created = JSON.parse(response.body)
        assert_equal "pending_company", created["status"]

        patch "/api/v1/counter_offers/#{created['id']}/accept",
              headers: auth_header_for(company_user),
              as: :json

        assert_response :ok
        job.reload
        assert_equal "filled", job.status
        assert_equal "rolling_start", job.start_mode
        assert_operator job.scheduled_start_at, :<=, Time.current + 2.seconds
        accepted_app = job.job_applications.find_by(status: :accepted)
        assert_not_nil accepted_app
        assert_equal tech_profile.id, accepted_app.technician_profile_id
      end

      test "company can counter and technician can decline" do
        company_user, _company_profile, job = create_company_with_job
        tech_user, _tech_profile = create_technician

        post "/api/v1/jobs/#{job.id}/counter_offers",
             params: {
               proposed_hourly_rate_cents: 3200,
               proposed_hours_per_day: 8,
               proposed_days: 5,
               proposed_start_mode: "hard_start",
               proposed_start_at: 2.days.from_now.iso8601,
               proposed_end_at: 7.days.from_now.iso8601
             },
             headers: auth_header_for(tech_user),
             as: :json
        assert_response :created
        first_offer = JSON.parse(response.body)

        patch "/api/v1/counter_offers/#{first_offer['id']}/counter",
              params: {
                proposed_hourly_rate_cents: 3300,
                proposed_hours_per_day: 8,
                proposed_days: 4,
                proposed_start_mode: "hard_start",
                proposed_start_at: 3.days.from_now.iso8601,
                proposed_end_at: 7.days.from_now.iso8601
              },
              headers: auth_header_for(company_user),
              as: :json
        assert_response :created
        countered = JSON.parse(response.body)
        assert_equal "pending_technician", countered["status"]

        patch "/api/v1/counter_offers/#{countered['id']}/decline",
              headers: auth_header_for(tech_user),
              as: :json
        assert_response :ok
      end
    end
  end
end
