require "test_helper"

module Api
  module V1
    class TimeEntriesControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      def setup
        @company_user = User.create!(email: "company-time-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "premium", membership_fee_waived: true)
        @company_user.update_column(:company_profile_id, @company_profile.id)

        @technician_user = User.create!(email: "tech-time-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        @technician_profile = TechnicianProfile.create!(user: @technician_user, trade_type: "General", availability: "Full-time", membership_level: "basic")
      end

      test "rejects weekend entry when weekend work is prohibited" do
        job = Job.create!(
          company_profile: @company_profile,
          title: "No weekend job",
          description: "desc",
          status: :filled,
          weekend_work_policy: :prohibited,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )
        JobApplication.create!(job: job, technician_profile: @technician_profile, status: :accepted)

        saturday = Date.today.next_occurring(:saturday)
        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               worked_start_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 8, 0).iso8601,
               worked_end_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 16, 0).iso8601,
               worked_on_date: saturday,
               worked_hours: 8
             },
             headers: auth_header_for(@technician_user),
             as: :json

        assert_response :unprocessable_entity
      end

      test "allows optional weekend entry only with accepted weekend request" do
        job = Job.create!(
          company_profile: @company_profile,
          title: "Optional weekend job",
          description: "desc",
          status: :filled,
          weekend_work_policy: :optional,
          saturday_work_policy: :premium_rate,
          saturday_multiplier: 1.5,
          scheduled_start_at: 1.day.from_now,
          scheduled_end_at: 2.days.from_now
        )
        JobApplication.create!(job: job, technician_profile: @technician_profile, status: :accepted)

        saturday = Date.today.next_occurring(:saturday)
        request = job.weekend_work_requests.create!(
          technician_profile: @technician_profile,
          requested_by_user: @company_user,
          status: :accepted_by_technician,
          requested_date: saturday,
          requested_start_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 8, 0),
          requested_end_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 16, 0),
          estimated_hours: 8,
          applicable_multiplier: 1.5
        )

        post "/api/v1/jobs/#{job.id}/time_entries",
             params: {
               weekend_work_request_id: request.id,
               worked_start_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 8, 0).iso8601,
               worked_end_at: Time.zone.local(saturday.year, saturday.month, saturday.day, 16, 0).iso8601,
               worked_on_date: saturday,
               worked_hours: 8
             },
             headers: auth_header_for(@technician_user),
             as: :json

        assert_response :created
        assert_equal 1, job.time_entries.count
        assert_equal 1.5, job.time_entries.first.time_entry_pay_line.applied_multiplier.to_f
      end
    end
  end
end
