# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/assessment_test_helper"

module Api
  module V1
    # The company-facing half of the assessment feature: what a company sees on
    # a technician card and profile, how it is worded, and how the directory can
    # be filtered by it.
    class TechnicianAssessmentResultsTest < ActionDispatch::IntegrationTest
      include AuthTestHelper
      include AssessmentTestHelper

      setup do
        @assessment = create_published_assessment!(
          slug: "company_view_hvac",
          title: "HVAC Knowledge Assessment",
          trade_type: "HVAC Technician",
          categories: {
            "safety" => { name: "Safety & Tools", blueprint: 2, bank: 4 },
            "diagnostics" => { name: "Diagnostics", blueprint: 2, bank: 4 }
          }
        )
        @company_user, = create_company!
      end

      test "a company sees the score, band and disclaimer on a technician profile" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 3)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        block = JSON.parse(response.body)["assessment_results"]
        primary = block["primary"]

        assert_equal "HVAC Knowledge Assessment", primary["assessment_title"]
        assert_equal 75, primary["score"]
        assert_equal "Advanced Apprentice", primary["score_band_label"]
        assert primary["completed_at"].present?
        assert_nil primary["attempts_count"], "retake counts stay private to the technician"
        assert_equal 1, primary["version_number"]
        assert_match(/not licenses, certifications/, primary["disclaimer"])
        assert_match(/not licenses, certifications/, block["disclaimer"])
      end

      test "the payload never calls a technician certified or qualified" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 4)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        block = JSON.parse(response.body)["assessment_results"].to_json

        assert_no_match(/certified/i, block)
        assert_no_match(/certification of/i, block)
        assert_match(/knowledge assessment/i, block)
      end

      test "a company sees the category breakdown on the full profile" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 4)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        categories = JSON.parse(response.body)["assessment_results"]["primary"]["category_scores"]

        assert_equal 2, categories.size
        assert_equal %w[diagnostics safety], categories.map { |entry| entry["slug"] }.sort
        assert categories.all? { |entry| entry["score"] == 100 }
      end

      test "the directory card carries the score without the category breakdown" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 2)

        get "/api/v1/technicians", headers: auth_header_for(@company_user)

        assert_response :ok
        card = JSON.parse(response.body).find { |entry| entry["id"] == profile.id }
        primary = card["assessment_results"]["primary"]

        assert_equal 50, primary["score"]
        assert primary["disclaimer"].present?
        assert_nil primary["category_scores"], "cards stay light; categories are on the full profile"
      end

      test "a company sees only the designated public result, not the attempt history" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 1)
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 4)
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 2)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        block = JSON.parse(response.body)["assessment_results"]

        assert_equal 1, block["results"].size, "one published result per assessment"
        assert_equal 100, block["primary"]["score"], "the best score is the published one"
        assert_not_includes response.body, "attempt_number"
        assert_nil block["primary"]["attempts_count"], "how many tries it took stays private"
      end

      test "the technician's own trade result is the headline when several exist" do
        plumbing = create_published_assessment!(
          slug: "company_view_plumbing", title: "Plumbing Knowledge Assessment", trade_type: "Plumber",
          categories: { "fixtures" => { name: "Fixtures", blueprint: 2, bank: 4 } }
        )
        _user, profile = create_technician!(trade_type: "Plumber")
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 4)
        complete_attempt!(technician_profile: profile, assessment: plumbing, correct_count: 1)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        block = JSON.parse(response.body)["assessment_results"]

        assert_equal 2, block["results"].size
        assert_equal "Plumbing Knowledge Assessment", block["primary"]["assessment_title"],
                     "the technician's own trade leads even with a lower score"
        assert_equal 50, block["primary"]["score"]
      end

      test "a technician with no completed assessment reports an empty block, not an error" do
        _user, profile = create_technician!

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        block = JSON.parse(response.body)["assessment_results"]

        assert_equal [], block["results"]
        assert_nil block["primary"]
        assert block["disclaimer"].present?
      end

      test "an in-progress attempt is not visible to companies" do
        _user, profile = create_technician!
        Assessments::StartAttempt.call(technician_profile: profile, assessment: @assessment)

        get "/api/v1/technicians/#{profile.id}", headers: auth_header_for(@company_user)

        assert_response :ok
        assert_equal [], JSON.parse(response.body)["assessment_results"]["results"]
      end

      test "the dedicated results endpoint serves companies, admins and the owner" do
        user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 3)
        admin = create_assessment_admin!

        [@company_user, admin, user].each do |viewer|
          get "/api/v1/technicians/#{profile.id}/assessment_results", headers: auth_header_for(viewer)

          assert_response :ok
          assert_equal 75, JSON.parse(response.body)["primary"]["score"]
        end
      end

      test "another technician cannot read someone else's results" do
        _user, profile = create_technician!
        other_user, = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 3)

        get "/api/v1/technicians/#{profile.id}/assessment_results", headers: auth_header_for(other_user)

        assert_response :forbidden
      end

      test "the results endpoint requires authentication" do
        _user, profile = create_technician!

        get "/api/v1/technicians/#{profile.id}/assessment_results"

        assert_response :unauthorized
      end

      test "no company-facing payload exposes answer-key data" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 3)

        [
          "/api/v1/technicians",
          "/api/v1/technicians/#{profile.id}",
          "/api/v1/technicians/#{profile.id}/assessment_results"
        ].each do |path|
          get path, headers: auth_header_for(@company_user)

          assert_response :ok
          assert_no_match(/"correct"/, response.body, "#{path} must not expose the answer key")
          assert_no_match(/correct_answer_choice_id/, response.body, "#{path} must not expose the answer key")
          assert_no_match(/"explanation"/, response.body, "#{path} must not expose explanations")
        end
      end

      # --- Directory filters -------------------------------------------------

      test "technicians can be filtered to those who completed an assessment" do
        _u1, completed = create_technician!
        _u2, not_completed = create_technician!
        complete_attempt!(technician_profile: completed, assessment: @assessment, correct_count: 3)

        get "/api/v1/technicians?assessment_completed=true", headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_includes ids, completed.id
        assert_not_includes ids, not_completed.id
      end

      test "technicians can be filtered by assessment slug" do
        plumbing = create_published_assessment!(
          slug: "filter_plumbing", trade_type: "Plumber",
          categories: { "fixtures" => { name: "Fixtures", blueprint: 2, bank: 4 } }
        )
        _u1, hvac_tech = create_technician!
        _u2, plumbing_tech = create_technician!(trade_type: "Plumber")
        complete_attempt!(technician_profile: hvac_tech, assessment: @assessment, correct_count: 3)
        complete_attempt!(technician_profile: plumbing_tech, assessment: plumbing, correct_count: 2)

        get "/api/v1/technicians?assessment_slug=filter_plumbing", headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_equal [plumbing_tech.id], ids
      end

      test "technicians can be filtered by a minimum score" do
        _u1, high = create_technician!
        _u2, low = create_technician!
        complete_attempt!(technician_profile: high, assessment: @assessment, correct_count: 4)
        complete_attempt!(technician_profile: low, assessment: @assessment, correct_count: 1)

        get "/api/v1/technicians?min_assessment_score=80", headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_equal [high.id], ids
      end

      test "technicians can be filtered by score band" do
        _u1, strong = create_technician!
        _u2, weak = create_technician!
        complete_attempt!(technician_profile: strong, assessment: @assessment, correct_count: 4)
        complete_attempt!(technician_profile: weak, assessment: @assessment, correct_count: 1)

        get "/api/v1/technicians?assessment_band=strong_knowledge", headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_equal [strong.id], ids
      end

      test "technicians can be filtered by a category score" do
        _u1, safety_strong = create_technician!
        _u2, safety_weak = create_technician!

        # Same overall score, opposite category strengths.
        answer_by_category(safety_strong, correct_category: "safety")
        answer_by_category(safety_weak, correct_category: "diagnostics")

        get "/api/v1/technicians?assessment_category_slug=safety&min_assessment_category_score=90",
            headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_equal [safety_strong.id], ids
      end

      test "assessment filters compose with each other" do
        _u1, match = create_technician!
        _u2, wrong_score = create_technician!
        complete_attempt!(technician_profile: match, assessment: @assessment, correct_count: 4)
        complete_attempt!(technician_profile: wrong_score, assessment: @assessment, correct_count: 1)

        get "/api/v1/technicians?assessment_slug=company_view_hvac&min_assessment_score=90",
            headers: auth_header_for(@company_user)

        assert_response :ok
        assert_equal [match.id], JSON.parse(response.body).map { |entry| entry["id"] }
      end

      test "the directory is unchanged when no assessment filter is sent" do
        _u1, with_result = create_technician!
        _u2, without_result = create_technician!
        complete_attempt!(technician_profile: with_result, assessment: @assessment, correct_count: 3)

        get "/api/v1/technicians", headers: auth_header_for(@company_user)

        assert_response :ok
        ids = JSON.parse(response.body).map { |entry| entry["id"] }
        assert_includes ids, with_result.id
        assert_includes ids, without_result.id
      end

      test "an unknown assessment slug filter returns nothing rather than everything" do
        _user, profile = create_technician!
        complete_attempt!(technician_profile: profile, assessment: @assessment, correct_count: 3)

        get "/api/v1/technicians?assessment_slug=nonexistent", headers: auth_header_for(@company_user)

        assert_response :ok
        assert_equal [], JSON.parse(response.body)
      end

      private

      # Answers one category fully right and the other fully wrong, so overall
      # scores tie and only the category breakdown distinguishes the two.
      def answer_by_category(profile, correct_category:)
        attempt = Assessments::StartAttempt.call(
          technician_profile: profile, assessment: @assessment
        ).attempt

        answers = attempt.assessment_attempt_questions.ordered.map do |attempt_question|
          correct_id = attempt_question.assessment_question.correct_answer_choice.id
          hit = attempt_question.assessment_category.slug == correct_category
          {
            "question_id" => attempt_question.assessment_question_id,
            "answer_choice_id" => hit ? correct_id : (attempt_question.presentation_choice_ids - [correct_id]).first
          }
        end

        Assessments::SaveAnswers.call(attempt: attempt, answers: answers)
        Assessments::SubmitAttempt.call(attempt: attempt.reload).attempt
      end
    end
  end
end
