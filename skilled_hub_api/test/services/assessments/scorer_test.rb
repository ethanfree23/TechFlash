# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class ScorerTest < ActiveSupport::TestCase
    include AssessmentTestHelper

    test "overall score is normalized to 0-100 regardless of question count" do
      four_question = create_published_assessment!(
        slug: "four_q",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      twenty_question = create_published_assessment!(
        slug: "twenty_q",
        categories: { "safety" => { name: "Safety", blueprint: 20, bank: 30 } }
      )
      _u1, p1 = create_technician!
      _u2, p2 = create_technician!

      small = complete_attempt!(technician_profile: p1, assessment: four_question, correct_count: 3)
      large = complete_attempt!(technician_profile: p2, assessment: twenty_question, correct_count: 15)

      assert_equal 75, small.score
      assert_equal 75, large.score
    end

    test "a perfect paper scores 100 and an empty paper scores 0" do
      assessment = create_published_assessment!(
        slug: "extremes",
        categories: { "safety" => { name: "Safety", blueprint: 5, bank: 10 } }
      )
      _u1, p1 = create_technician!
      _u2, p2 = create_technician!

      perfect = complete_attempt!(technician_profile: p1, assessment: assessment, correct_count: 5)
      blank = complete_attempt!(technician_profile: p2, assessment: assessment, correct_count: 0)

      assert_equal 100, perfect.score
      assert_equal 0, blank.score
    end

    test "unanswered questions count as incorrect" do
      assessment = create_published_assessment!(
        slug: "unanswered",
        categories: { "safety" => { name: "Safety", blueprint: 10, bank: 15 } }
      )
      _user, profile = create_technician!

      attempt = complete_attempt!(
        technician_profile: profile, assessment: assessment, correct_count: 5, leave_blank: 5
      )

      assert_equal 10, attempt.total_questions
      assert_equal 5, attempt.answered_questions
      assert_equal 5, attempt.correct_answers
      assert_equal 50, attempt.score
    end

    test "category scores are computed per category" do
      assessment = create_published_assessment!(
        slug: "per_category",
        categories: {
          "safety" => { name: "Safety & Tools", blueprint: 4, bank: 8 },
          "diagnostics" => { name: "Diagnostics", blueprint: 4, bank: 8 }
        }
      )
      _user, profile = create_technician!

      started = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      # Answer every Safety question correctly and every Diagnostics question wrong.
      answers = started.assessment_attempt_questions.ordered.map do |attempt_question|
        correct_id = attempt_question.assessment_question.correct_answer_choice.id
        safety = attempt_question.assessment_category.slug == "safety"
        {
          "question_id" => attempt_question.assessment_question_id,
          "answer_choice_id" => safety ? correct_id : (attempt_question.presentation_choice_ids - [correct_id]).first
        }
      end
      SaveAnswers.call(attempt: started, answers: answers)
      attempt = SubmitAttempt.call(attempt: started.reload).attempt

      results = attempt.assessment_attempt_category_results.ordered.index_by(&:category_slug)

      assert_equal 100, results["safety"].score
      assert_equal 0, results["diagnostics"].score
      assert_equal 4, results["safety"].questions_count
      assert_equal 4, results["safety"].correct_count
      assert_equal 50, attempt.score
    end

    test "category result names are stored so a later rename cannot alter history" do
      assessment = create_published_assessment!(
        slug: "stored_names",
        categories: { "safety" => { name: "Safety & Tools", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)
      result = attempt.assessment_attempt_category_results.first

      assert_equal "Safety & Tools", result.category_name
      assert_equal "safety", result.category_slug
    end

    test "score bands resolve from configured thresholds" do
      assessment = create_published_assessment!(
        slug: "bands",
        categories: { "safety" => { name: "Safety", blueprint: 10, bank: 20 } }
      )

      expectations = {
        2 => ["foundational", "Foundational"],
        5 => ["developing", "Developing"],
        6 => ["apprentice", "Apprentice"],
        8 => ["advanced_apprentice", "Advanced Apprentice"],
        10 => ["strong_knowledge", "Strong Knowledge"]
      }

      expectations.each do |correct, (slug, label)|
        _user, profile = create_technician!
        attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: correct)

        assert_equal slug, attempt.score_band_slug, "score #{attempt.score} should be #{slug}"
        assert_equal label, attempt.score_band_label
      end
    end

    test "the band captured at completion survives a later threshold change" do
      assessment = create_published_assessment!(
        slug: "band_history",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!

      attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 3)
      assert_equal "Advanced Apprentice", attempt.score_band_label

      # A future version relabels the same numeric range.
      clone = VersionPublisher.clone_to_draft(assessment.live_version).version
      clone.update!(score_bands: [
                      { "slug" => "tier_one", "label" => "Tier One", "min_score" => 0, "max_score" => 100 }
                    ])
      assert VersionPublisher.publish!(clone.reload).success?

      assert_equal "Advanced Apprentice", attempt.reload.score_band_label
      assert_equal 75, attempt.score
    end

    test "category weighted scoring weights category percentages" do
      assessment = create_published_assessment!(
        slug: "weighted",
        scoring_strategy: "category_weighted",
        categories: {
          "heavy" => { name: "Heavy", blueprint: 2, bank: 4, weight: 3.0 },
          "light" => { name: "Light", blueprint: 2, bank: 4, weight: 1.0 }
        }
      )
      _user, profile = create_technician!

      started = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      answers = started.assessment_attempt_questions.ordered.map do |attempt_question|
        correct_id = attempt_question.assessment_question.correct_answer_choice.id
        heavy = attempt_question.assessment_category.slug == "heavy"
        {
          "question_id" => attempt_question.assessment_question_id,
          "answer_choice_id" => heavy ? correct_id : (attempt_question.presentation_choice_ids - [correct_id]).first
        }
      end
      SaveAnswers.call(attempt: started, answers: answers)
      attempt = SubmitAttempt.call(attempt: started.reload).attempt

      # Heavy 100 at weight 3, Light 0 at weight 1 => 75, not the unweighted 50.
      assert_equal 75, attempt.score
    end

    test "passed is nil when no passing score is configured and boolean when it is" do
      open_assessment = create_published_assessment!(
        slug: "no_benchmark",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      gated_assessment = create_published_assessment!(
        slug: "with_benchmark",
        passing_score: 70,
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _u1, p1 = create_technician!
      _u2, p2 = create_technician!
      _u3, p3 = create_technician!

      assert_nil complete_attempt!(technician_profile: p1, assessment: open_assessment, correct_count: 2).passed
      assert_equal true, complete_attempt!(technician_profile: p2, assessment: gated_assessment, correct_count: 3).passed
      assert_equal false, complete_attempt!(technician_profile: p3, assessment: gated_assessment, correct_count: 2).passed
    end

    test "duration is recorded for a completed attempt" do
      assessment = create_published_assessment!(
        slug: "duration",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      started = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      started.update_columns(started_at: 10.minutes.ago)
      answer_attempt!(started.reload, correct_count: 2)
      attempt = SubmitAttempt.call(attempt: started.reload).attempt

      assert_in_delta 600, attempt.duration_seconds, 5
    end
  end
end
