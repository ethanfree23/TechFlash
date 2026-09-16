# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class PublicResultProjectorTest < ActiveSupport::TestCase
    include AssessmentTestHelper
    include ActiveSupport::Testing::TimeHelpers

    test "best_valid publishes the highest score, not the latest" do
      assessment = ten_question_assessment("best_rule")
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 9)
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 6)

      result = TechnicianAssessmentResult.find_by!(technician_profile_id: profile.id, assessment_id: assessment.id)

      assert_equal "best_valid", result.selection_rule
      assert_equal 90, result.score
      assert_equal 90, result.best_score
      assert_equal 60, result.latest_score
      assert_equal 2, result.attempts_count
    end

    test "an improved retake replaces the published score" do
      assessment = ten_question_assessment("improved_retake")
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 6)
      assert_equal 60, published_score(profile, assessment)

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 8)

      result = TechnicianAssessmentResult.find_by!(technician_profile_id: profile.id, assessment_id: assessment.id)
      assert_equal 80, result.score
      assert_equal 80, result.best_score
      assert_equal 80, result.latest_score
      assert_equal 2, result.attempts_count
    end

    test "latest_valid publishes the most recent score even when it is lower" do
      assessment = ten_question_assessment("latest_rule")
      assessment.update!(public_result_rule: "latest_valid")
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 9)
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 5)

      result = TechnicianAssessmentResult.find_by!(technician_profile_id: profile.id, assessment_id: assessment.id)

      assert_equal "latest_valid", result.selection_rule
      assert_equal 50, result.score
      assert_equal 90, result.best_score
    end

    test "switching the rule recomputes existing projections" do
      assessment = ten_question_assessment("switch_rule")
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 9)
      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 4)
      assert_equal 90, published_score(profile, assessment)

      assessment.update!(public_result_rule: "latest_valid")
      PublicResultProjector.recompute_assessment(assessment)

      assert_equal 40, published_score(profile, assessment)
    end

    test "the published completion date is the designated attempt's date" do
      assessment = ten_question_assessment("published_date")
      _user, profile = create_technician!

      best_completed_at = nil
      travel_to Time.utc(2026, 8, 10, 12, 0, 0) do
        best_completed_at = complete_attempt!(
          technician_profile: profile, assessment: assessment, correct_count: 9
        ).completed_at
      end
      travel_to Time.utc(2026, 9, 15, 12, 0, 0) do
        complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 5)
      end

      result = TechnicianAssessmentResult.find_by!(technician_profile_id: profile.id, assessment_id: assessment.id)

      assert_equal best_completed_at.to_i, result.completed_at.to_i
      assert_equal Time.utc(2026, 9, 15, 12, 0, 0).to_i, result.latest_completed_at.to_i
    end

    test "the projection carries the designated attempt's category scores and version" do
      assessment = create_published_assessment!(
        slug: "projection_detail",
        categories: {
          "safety" => { name: "Safety & Tools", blueprint: 2, bank: 4 },
          "diagnostics" => { name: "Diagnostics", blueprint: 2, bank: 4 }
        }
      )
      _user, profile = create_technician!
      attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 4)

      result = TechnicianAssessmentResult.find_by!(technician_profile_id: profile.id, assessment_id: assessment.id)

      assert_equal attempt.id, result.assessment_attempt_id
      assert_equal assessment.live_version.id, result.assessment_version_id
      assert_equal %w[safety diagnostics].sort, result.category_scores_list.map { |c| c["slug"] }.sort
      assert result.category_scores_list.all? { |c| c["score"] == 100 }
    end

    test "an in-progress attempt produces no published result" do
      assessment = ten_question_assessment("no_result_yet")
      _user, profile = create_technician!

      StartAttempt.call(technician_profile: profile, assessment: assessment)

      assert_nil TechnicianAssessmentResult.find_by(technician_profile_id: profile.id, assessment_id: assessment.id)
    end

    test "an expired attempt with a score is still eligible to be published" do
      assessment = create_published_assessment!(
        slug: "expired_publishable",
        time_limit_minutes: 5,
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      answer_attempt!(attempt, correct_count: 3)

      travel 6.minutes do
        AttemptExpirer.expire!(attempt.reload)
      end

      result = TechnicianAssessmentResult.find_by(technician_profile_id: profile.id, assessment_id: assessment.id)
      assert result.present?
      assert_equal 75, result.score
    end

    test "results are tracked independently per assessment" do
      hvac = ten_question_assessment("multi_hvac", trade_type: "HVAC Technician")
      plumbing = ten_question_assessment("multi_plumbing", trade_type: "Plumber")
      _user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: hvac, correct_count: 8)
      complete_attempt!(technician_profile: profile, assessment: plumbing, correct_count: 5)

      assert_equal 80, published_score(profile, hvac)
      assert_equal 50, published_score(profile, plumbing)
      assert_equal 2, TechnicianAssessmentResult.where(technician_profile_id: profile.id).count
    end

    test "a technician has at most one published result per assessment" do
      assessment = ten_question_assessment("one_result")
      _user, profile = create_technician!

      4.times { |n| complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: n + 1) }

      assert_equal 1, TechnicianAssessmentResult.where(
        technician_profile_id: profile.id, assessment_id: assessment.id
      ).count
    end

    private

    def ten_question_assessment(slug, trade_type: "HVAC Technician")
      create_published_assessment!(
        slug: slug,
        trade_type: trade_type,
        categories: { "safety" => { name: "Safety", blueprint: 10, bank: 20 } }
      )
    end

    def published_score(profile, assessment)
      TechnicianAssessmentResult.find_by(
        technician_profile_id: profile.id, assessment_id: assessment.id
      )&.score
    end
  end
end
