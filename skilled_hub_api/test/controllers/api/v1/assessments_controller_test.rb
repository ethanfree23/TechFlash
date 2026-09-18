# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/assessment_test_helper"

module Api
  module V1
    class AssessmentsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper
      include AssessmentTestHelper

      test "technician sees the catalog with state and eligibility" do
        assessment = create_published_assessment!(
          slug: "catalog_hvac",
          title: "HVAC Knowledge Assessment",
          trade_type: "HVAC Technician",
          categories: { "safety" => { name: "Safety & Tools", blueprint: 4, bank: 10 } }
        )
        user, = create_technician!(trade_type: "HVAC Technician")

        get "/api/v1/assessments", headers: auth_header_for(user)

        assert_response :ok
        body = JSON.parse(response.body)
        entry = body["assessments"].find { |item| item["slug"] == "catalog_hvac" }

        assert_equal "HVAC Knowledge Assessment", entry["title"]
        assert_equal "not_started", entry["state"]
        assert_equal true, entry["recommended"]
        assert_equal true, entry["can_start"]
        assert_equal 4, entry["question_count"]
        assert_equal 30, entry["time_limit_minutes"]
        assert_equal 30, entry["estimated_minutes"]
        assert_equal 1, entry["version_number"]
        assert_nil entry["in_progress_attempt"]
        assert_nil entry["result"]
        assert_match(/not licenses, certifications/, body["disclaimer"])
      end

      test "the catalog never includes question content or answer keys" do
        create_published_assessment!(slug: "no_leak_catalog")
        user, = create_technician!

        get "/api/v1/assessments", headers: auth_header_for(user)

        assert_response :ok
        assert_no_answer_key(response.body)
        assert_not_includes response.body, "prompt?"
      end

      test "the recommended assessment follows the technician's primary trade" do
        create_published_assessment!(slug: "rec_hvac", title: "HVAC", trade_type: "HVAC Technician")
        create_published_assessment!(slug: "rec_plumbing", title: "Plumbing", trade_type: "Plumber")
        create_published_assessment!(slug: "rec_electrical", title: "Electrical", trade_type: "Electrician")

        {
          "HVAC Technician" => "rec_hvac",
          "Plumber" => "rec_plumbing",
          "Electrician" => "rec_electrical"
        }.each do |trade, expected_slug|
          user, = create_technician!(trade_type: trade)

          get "/api/v1/assessments", headers: auth_header_for(user)

          assert_response :ok
          entries = JSON.parse(response.body)["assessments"]
          recommended = entries.select { |entry| entry["recommended"] }

          assert_equal [expected_slug], recommended.map { |entry| entry["slug"] },
                       "#{trade} should be recommended #{expected_slug}"
          assert_equal expected_slug, entries.first["slug"], "recommended assessment should sort first"
          assert_equal 3, entries.size, "other trades stay visible but unrecommended"
        end
      end

      test "catalog state reflects an in-progress attempt" do
        assessment = create_published_assessment!(
          slug: "catalog_in_progress",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        attempt = Assessments::StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
        answer_attempt!(attempt, correct_count: 2, leave_blank: 2)

        get "/api/v1/assessments", headers: auth_header_for(user)

        entry = JSON.parse(response.body)["assessments"].find { |item| item["slug"] == "catalog_in_progress" }
        assert_equal "in_progress", entry["state"]
        assert_equal attempt.id, entry["in_progress_attempt"]["id"]
        assert_equal 2, entry["in_progress_attempt"]["answered_questions"]
        assert_equal 50, entry["in_progress_attempt"]["progress_percent"]
      end

      test "catalog state reflects a completed assessment with its result" do
        assessment = create_published_assessment!(
          slug: "catalog_completed",
          categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
        )
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 3)

        get "/api/v1/assessments", headers: auth_header_for(user)

        entry = JSON.parse(response.body)["assessments"].find { |item| item["slug"] == "catalog_completed" }
        assert_equal "completed", entry["state"]
        assert_equal 1, entry["attempts_count"]
        assert_equal 75, entry["result"]["score"]
        assert_equal "Advanced Apprentice", entry["result"]["score_band_label"]
      end

      test "the catalog explains why a blocked assessment cannot be started" do
        assessment = create_published_assessment!(
          slug: "catalog_blocked",
          max_attempts: 1,
          categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
        )
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 1)

        get "/api/v1/assessments", headers: auth_header_for(user)

        entry = JSON.parse(response.body)["assessments"].find { |item| item["slug"] == "catalog_blocked" }
        assert_equal false, entry["can_start"]
        assert_equal "max_attempts_reached", entry["start_blocked_reason"]
        assert_match(/all 1 attempts/, entry["start_blocked_message"])
      end

      test "the catalog omits assessments with no published version" do
        draft = Assessment.create!(slug: "catalog_draft", title: "Draft Only")
        draft.assessment_versions.create!(version_number: 1, score_bands: Assessments::ScoreBands.starter_template)
        user, = create_technician!

        get "/api/v1/assessments", headers: auth_header_for(user)

        slugs = JSON.parse(response.body)["assessments"].map { |entry| entry["slug"] }
        assert_not_includes slugs, "catalog_draft"
      end

      test "the catalog omits deactivated assessments" do
        assessment = create_published_assessment!(slug: "catalog_inactive")
        assessment.update!(active: false)
        user, = create_technician!

        get "/api/v1/assessments", headers: auth_header_for(user)

        slugs = JSON.parse(response.body)["assessments"].map { |entry| entry["slug"] }
        assert_not_includes slugs, "catalog_inactive"
      end

      test "the catalog reports the technician's profile contribution" do
        assessment = create_published_assessment!(
          slug: "catalog_contribution",
          categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
        )
        user, profile = create_technician!

        get "/api/v1/assessments", headers: auth_header_for(user)
        contribution = JSON.parse(response.body)["profile_contribution"]
        assert_equal "not_started", contribution["state"]
        assert_equal 0, contribution["earned_strength_percent"]
        assert_equal false, contribution["counts_toward_job_access"]

        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

        get "/api/v1/assessments", headers: auth_header_for(user)
        contribution = JSON.parse(response.body)["profile_contribution"]
        assert_equal "completed", contribution["state"]
        assert_equal 100, contribution["score"]
        assert_equal 15, contribution["earned_strength_percent"]
        assert_equal false, contribution["counts_toward_job_access"]
      end

      test "an assessment can be fetched by slug or id" do
        assessment = create_published_assessment!(slug: "by_slug")
        user, = create_technician!

        get "/api/v1/assessments/by_slug", headers: auth_header_for(user)
        assert_response :ok
        assert_equal assessment.id, JSON.parse(response.body)["id"]

        get "/api/v1/assessments/#{assessment.id}", headers: auth_header_for(user)
        assert_response :ok
        assert_equal "by_slug", JSON.parse(response.body)["slug"]
      end

      test "an unknown assessment returns not found" do
        user, = create_technician!

        get "/api/v1/assessments/does_not_exist", headers: auth_header_for(user)

        assert_response :not_found
      end

      test "companies cannot read the technician assessment catalog" do
        create_published_assessment!(slug: "catalog_company_denied")
        company_user, = create_company!

        get "/api/v1/assessments", headers: auth_header_for(company_user)

        assert_response :forbidden
      end

      test "admins cannot read the technician assessment catalog" do
        create_published_assessment!(slug: "catalog_admin_denied")
        admin = create_assessment_admin!

        get "/api/v1/assessments", headers: auth_header_for(admin)

        assert_response :forbidden
      end

      test "the catalog requires authentication" do
        create_published_assessment!(slug: "catalog_anon")

        get "/api/v1/assessments"

        assert_response :unauthorized
      end

      test "a technician with no profile gets a clear not found" do
        user = User.create!(
          email: "no-profile-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )

        get "/api/v1/assessments", headers: auth_header_for(user)

        assert_response :not_found
      end

      private

      def assert_no_answer_key(body)
        parsed = JSON.parse(body)
        assert_not deep_key?(parsed, "correct"), "payload must not expose answer-key data"
        assert_not deep_key?(parsed, "correct_answer_choice_id"), "payload must not expose the correct choice"
      end

      def deep_key?(node, key)
        case node
        when Hash
          return true if node.key?(key)

          node.values.any? { |value| deep_key?(value, key) }
        when Array
          node.any? { |value| deep_key?(value, key) }
        else
          false
        end
      end
    end
  end
end
