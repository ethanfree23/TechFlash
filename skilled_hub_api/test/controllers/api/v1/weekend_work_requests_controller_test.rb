require "test_helper"

module Api
  module V1
    class WeekendWorkRequestsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def setup
        @company_user = User.create!(email: "company-weekend-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "premium", membership_fee_waived: true)
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @technician_user = User.create!(email: "tech-weekend-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        @technician_profile = TechnicianProfile.create!(user: @technician_user, trade_type: "General", availability: "Full-time", membership_level: "basic")

        @job = Job.create!(
          company_profile: @company_profile,
          title: "Weekend optional job",
          description: "desc",
          status: :filled,
          weekend_work_policy: :optional,
          saturday_work_policy: :premium_rate,
          saturday_multiplier: 1.5,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )
        JobApplication.create!(job: @job, technician_profile: @technician_profile, status: :accepted)
      end

      test "company can create weekend work request" do
        post "/api/v1/jobs/#{@job.id}/weekend_work_requests",
             params: {
               requested_date: Date.today.next_occurring(:saturday),
               requested_start_at: 2.days.from_now.iso8601,
               requested_end_at: 2.days.from_now.change(hour: 16).iso8601,
               estimated_hours: 8,
               applicable_multiplier: 1.5
             },
             headers: auth_header_for(@company_user),
             as: :json

        assert_response :created
        assert_equal 1, @job.weekend_work_requests.count
      end

      test "technician can accept weekend request" do
        request = @job.weekend_work_requests.create!(
          technician_profile: @technician_profile,
          requested_by_user: @company_user,
          status: :requested_by_company,
          requested_date: Date.today.next_occurring(:saturday),
          requested_start_at: 2.days.from_now,
          requested_end_at: 2.days.from_now.change(hour: 16),
          estimated_hours: 8,
          applicable_multiplier: 1.5
        )

        put "/api/v1/jobs/#{@job.id}/weekend_work_requests/#{request.id}",
            params: { status: "accepted_by_technician" },
            headers: auth_header_for(@technician_user),
            as: :json

        assert_response :ok
        request.reload
        assert_equal "accepted_by_technician", request.status
      end
    end
  end
end
