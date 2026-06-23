require "test_helper"

module Api
  module V1
    class RatingsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "company review requires full questionnaire and min comment length" do
        company_user, company_profile, technician_user, _technician_profile, job = setup_finished_job_pair("ratings-required-fields")

        post "/api/v1/ratings",
             params: {
               job_id: job.id,
               category_scores: Rating::COMPANY_REVIEW_CATEGORIES.keys.index_with { 5 },
               comment: "Too short"
             },
             headers: auth_header_for(company_user),
             as: :json

        assert_response :unprocessable_entity

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
             headers: auth_header_for(company_user),
             as: :json

        assert_response :created
        assert_equal 1, Rating.where(job_id: job.id, reviewer: company_profile).count
      end

      test "double blind hides counterparty review until both submit" do
        company_user, _company_profile, technician_user, _technician_profile, job = setup_finished_job_pair("ratings-double-blind")

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
             headers: auth_header_for(company_user),
             as: :json
        assert_response :created

        get "/api/v1/ratings", params: { job_id: job.id }, headers: auth_header_for(technician_user), as: :json
        assert_response :ok
        payload = JSON.parse(response.body)
        assert_equal 0, payload["ratings"].size
        assert_equal true, payload["other_party_has_reviewed"]
        assert_equal false, payload["current_user_has_reviewed"]

        post "/api/v1/ratings",
             params: {
               job_id: job.id,
               category_scores: Rating::TECH_REVIEW_CATEGORIES.keys.index_with { 5 },
               comment: "Site prep and communication were clear, payment experience was smooth, and the posted scope matched the actual work on arrival.",
               would_work_again: true,
               payment_on_time: true,
               job_description_match: "yes"
             },
             headers: auth_header_for(technician_user),
             as: :json
        assert_response :created

        get "/api/v1/ratings", params: { job_id: job.id }, headers: auth_header_for(company_user), as: :json
        assert_response :ok
        payload = JSON.parse(response.body)
        assert_equal 2, payload["ratings"].size
      end

      test "review creation is blocked after 14 day review window" do
        company_user, _company_profile, _technician_user, _technician_profile, job = setup_finished_job_pair("ratings-window-expired")
        job.update_column(:finished_at, 15.days.ago)

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
             headers: auth_header_for(company_user),
             as: :json

        assert_response :unprocessable_entity
        assert_includes response.body, "Review window has expired"
      end

      private

      def setup_finished_job_pair(seed)
        company_user = User.create!(
          email: "company-#{seed}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)

        technician_user = User.create!(
          email: "technician-#{seed}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        technician_profile = TechnicianProfile.create!(
          user: technician_user,
          membership_level: "basic",
          trade_type: "Electrician",
          availability: "Full-time",
          phone: "555-555-1000"
        )

        job = Job.create!(
          company_profile: company_profile,
          title: "Finished job #{seed}",
          description: "Completed work",
          status: :finished,
          finished_at: 2.days.ago,
          scheduled_start_at: 3.days.ago,
          scheduled_end_at: 2.days.ago
        )
        JobApplication.create!(
          job: job,
          technician_profile: technician_profile,
          status: :accepted
        )

        [company_user, company_profile, technician_user, technician_profile, job]
      end
    end
  end
end
