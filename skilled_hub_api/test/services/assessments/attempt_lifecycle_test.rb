# frozen_string_literal: true

require "test_helper"
require_relative "../../support/assessment_test_helper"

module Assessments
  class AttemptLifecycleTest < ActiveSupport::TestCase
    include AssessmentTestHelper
    include ActiveSupport::Testing::TimeHelpers

    test "starting an assessment persists an attempt with its question paper" do
      assessment = create_published_assessment!(
        slug: "start_persists",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 10 } }
      )
      _user, profile = create_technician!

      result = StartAttempt.call(technician_profile: profile, assessment: assessment)
      attempt = result.attempt

      assert result.success?
      assert_not result.resumed?
      assert attempt.in_progress?
      assert_equal 1, attempt.attempt_number
      assert_equal 4, attempt.total_questions
      assert_equal 4, attempt.assessment_attempt_questions.count
      assert_equal profile.user_id, attempt.user_id
      assert_equal assessment.live_version.id, attempt.assessment_version_id
      assert attempt.selection_seed.present?
      assert_equal 30, attempt.time_limit_minutes
      assert attempt.expires_at.present?
    end

    test "the attempt snapshots the rules it was started under" do
      assessment = create_published_assessment!(
        slug: "snapshot",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!

      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      snapshot = attempt.config_snapshot

      assert_equal "snapshot", snapshot["assessment_slug"]
      assert_equal 1, snapshot["version_number"]
      assert_equal 30, snapshot["time_limit_minutes"]
      assert_equal 5, snapshot["score_bands"].size
      assert_equal ["safety"], snapshot["categories"].map { |category| category["slug"] }
    end

    test "starting again resumes the live attempt instead of creating a second one" do
      assessment = create_published_assessment!(slug: "resume_same")
      _user, profile = create_technician!

      first = StartAttempt.call(technician_profile: profile, assessment: assessment)
      second = StartAttempt.call(technician_profile: profile, assessment: assessment)

      assert second.resumed?
      assert_equal first.attempt.id, second.attempt.id
      assert_equal 1, AssessmentAttempt.where(technician_profile_id: profile.id).count
    end

    test "a database constraint prevents two live attempts for the same assessment" do
      assessment = create_published_assessment!(slug: "one_live")
      _user, profile = create_technician!
      first = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      assert_raises(ActiveRecord::RecordNotUnique) do
        AssessmentAttempt.create!(
          technician_profile: profile,
          user_id: profile.user_id,
          assessment: assessment,
          assessment_version_id: first.assessment_version_id,
          attempt_number: 99,
          status: :in_progress,
          started_at: Time.current
        )
      end
    end

    test "answers saved before the app closes are still there on resume" do
      assessment = create_published_assessment!(
        slug: "resume_answers",
        categories: { "safety" => { name: "Safety", blueprint: 6, bank: 12 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      answer_attempt!(attempt, correct_count: 3, leave_blank: 3)
      assert_equal 3, attempt.reload.answered_questions

      resumed = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      assert_equal attempt.id, resumed.id
      assert_equal 3, resumed.answered_questions
      assert_equal 3, resumed.assessment_attempt_questions.answered.count
    end

    test "saving the same answer twice is a no-op" do
      assessment = create_published_assessment!(
        slug: "idempotent_save",
        categories: { "safety" => { name: "Safety", blueprint: 3, bank: 6 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      attempt_question = attempt.assessment_attempt_questions.ordered.first
      choice_id = attempt_question.presentation_choice_ids.first
      payload = [{ "question_id" => attempt_question.assessment_question_id, "answer_choice_id" => choice_id }]

      first = SaveAnswers.call(attempt: attempt, answers: payload)
      second = SaveAnswers.call(attempt: attempt.reload, answers: payload)

      assert_equal 1, first.saved_count
      assert_equal 0, second.saved_count
      assert_equal 1, attempt.reload.answered_questions
    end

    test "an answer can be changed and cleared before submission" do
      assessment = create_published_assessment!(
        slug: "change_answer",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      attempt_question = attempt.assessment_attempt_questions.ordered.first
      first_choice, second_choice = attempt_question.presentation_choice_ids.first(2)
      question_id = attempt_question.assessment_question_id

      SaveAnswers.call(attempt: attempt, answers: [{ "question_id" => question_id, "answer_choice_id" => first_choice }])
      SaveAnswers.call(attempt: attempt.reload, answers: [{ "question_id" => question_id, "answer_choice_id" => second_choice }])
      assert_equal second_choice, attempt_question.reload.selected_answer_choice_id

      SaveAnswers.call(attempt: attempt.reload, answers: [{ "question_id" => question_id, "answer_choice_id" => nil }])
      assert_nil attempt_question.reload.selected_answer_choice_id
      assert_equal 0, attempt.reload.answered_questions
    end

    test "a choice from a different question is rejected" do
      assessment = create_published_assessment!(
        slug: "foreign_choice",
        categories: { "safety" => { name: "Safety", blueprint: 3, bank: 6 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      rows = attempt.assessment_attempt_questions.ordered.to_a
      foreign_choice_id = rows.second.presentation_choice_ids.first

      result = SaveAnswers.call(
        attempt: attempt,
        answers: [{ "question_id" => rows.first.assessment_question_id, "answer_choice_id" => foreign_choice_id }]
      )

      assert result.success?
      assert_equal 0, result.saved_count
      assert_nil rows.first.reload.selected_answer_choice_id
    end

    test "answers for questions not drawn for this attempt are ignored" do
      assessment = create_published_assessment!(
        slug: "undrawn_question",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 8 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      drawn_ids = attempt.assessment_attempt_questions.pluck(:assessment_question_id)
      undrawn = assessment.live_version.assessment_questions.where.not(id: drawn_ids).first

      result = SaveAnswers.call(
        attempt: attempt,
        answers: [{
          "question_id" => undrawn.id,
          "answer_choice_id" => undrawn.correct_answer_choice.id
        }]
      )

      assert_equal 0, result.saved_count
      assert_equal 2, attempt.reload.total_questions
    end

    test "submitting scores the attempt and records completion timestamps" do
      assessment = create_published_assessment!(
        slug: "submit_scores",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      answer_attempt!(attempt, correct_count: 3)

      result = SubmitAttempt.call(attempt: attempt.reload)
      finished = result.attempt

      assert result.success?
      assert_not result.already_finalized?
      assert finished.completed?
      assert_equal 75, finished.score
      assert_equal 3, finished.correct_answers
      assert finished.submitted_at.present?
      assert finished.completed_at.present?
      assert finished.duration_seconds.present?
    end

    test "a duplicate submit returns the already-scored attempt without rescoring" do
      assessment = create_published_assessment!(
        slug: "duplicate_submit",
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      answer_attempt!(attempt, correct_count: 4)

      first = SubmitAttempt.call(attempt: attempt.reload)
      completed_at = first.attempt.completed_at
      second = SubmitAttempt.call(attempt: attempt.reload)
      third = SubmitAttempt.call(attempt: attempt.reload)

      assert_not first.already_finalized?
      assert second.already_finalized?
      assert third.already_finalized?
      assert_equal 100, second.attempt.score
      assert_equal completed_at.to_i, second.attempt.completed_at.to_i
      assert_equal 1, AssessmentAttempt.where(technician_profile_id: profile.id).count
      assert_equal 1, TechnicianAssessmentResult.where(technician_profile_id: profile.id).count
    end

    test "a timed attempt past its limit expires and is scored on submitted answers" do
      assessment = create_published_assessment!(
        slug: "expiry",
        time_limit_minutes: 10,
        categories: { "safety" => { name: "Safety", blueprint: 4, bank: 8 } }
      )
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt
      answer_attempt!(attempt, correct_count: 2, leave_blank: 2)

      travel 11.minutes do
        assert attempt.reload.past_time_limit?
        expired = AttemptExpirer.expire!(attempt.reload)

        assert expired.expired?
        assert_equal 50, expired.score
        assert_equal 2, expired.correct_answers
        assert expired.completed_at.present?
      end
    end

    test "an expired attempt rejects further answers" do
      assessment = create_published_assessment!(slug: "expired_readonly", time_limit_minutes: 5)
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      travel 6.minutes do
        result = SaveAnswers.call(attempt: attempt.reload, answers: [])

        assert_not result.success?
        assert_equal "attempt_expired", result.error_code
        assert attempt.reload.expired?
      end
    end

    test "the expiry sweep closes stale attempts" do
      assessment = create_published_assessment!(slug: "sweep", time_limit_minutes: 5)
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      travel 6.minutes do
        AttemptExpirer.sweep
        assert attempt.reload.expired?
      end
    end

    test "an expired attempt frees the technician to start a new one" do
      assessment = create_published_assessment!(slug: "expired_then_new", time_limit_minutes: 5)
      _user, profile = create_technician!
      first = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      travel 6.minutes do
        second = StartAttempt.call(technician_profile: profile, assessment: assessment)

        assert second.success?
        assert_not second.resumed?
        assert_not_equal first.id, second.attempt.id
        assert_equal 2, second.attempt.attempt_number
        assert first.reload.expired?
      end
    end

    test "an untimed assessment never expires" do
      assessment = create_published_assessment!(slug: "untimed", time_limit_minutes: nil)
      _user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      assert_nil attempt.expires_at
      assert_nil attempt.remaining_seconds

      travel 30.days do
        assert_not attempt.reload.past_time_limit?
        assert attempt.reload.in_progress?
      end
    end

    test "an assessment with no published version cannot be started" do
      assessment = Assessment.create!(slug: "draft_only_start", title: "Draft Only")
      assessment.assessment_versions.create!(version_number: 1, score_bands: ScoreBands.starter_template)
      _user, profile = create_technician!

      result = StartAttempt.call(technician_profile: profile, assessment: assessment)

      assert_not result.success?
      assert_equal "assessment_unavailable", result.error_code
    end

    test "an inactive assessment cannot be started" do
      assessment = create_published_assessment!(slug: "inactive_start")
      assessment.update!(active: false)
      _user, profile = create_technician!

      result = StartAttempt.call(technician_profile: profile, assessment: assessment)

      assert_not result.success?
      assert_equal "assessment_inactive", result.error_code
    end

    test "an attempt records the version live when it started, not the newest" do
      assessment = create_published_assessment!(
        slug: "version_pinned",
        categories: { "safety" => { name: "Safety", blueprint: 2, bank: 4 } }
      )
      v1 = assessment.live_version
      _user, profile = create_technician!
      attempt = complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

      clone = VersionPublisher.clone_to_draft(v1).version
      assert VersionPublisher.publish!(clone.reload).success?

      assert_equal v1.id, attempt.reload.assessment_version_id
      assert_equal 1, attempt.assessment_version.version_number
      assert_equal 2, assessment.reload.live_version.version_number
    end

    test "completing an attempt notifies the technician" do
      assessment = create_published_assessment!(slug: "notify_complete")
      user, profile = create_technician!

      complete_attempt!(technician_profile: profile, assessment: assessment, correct_count: 2)

      notification = AppNotification.where(user_id: user.id, category: "assessment").last
      assert notification.present?
      assert_match(/completed/i, notification.title)
      assert_equal "attempt_completed", notification.metadata["event"]
      assert_equal 100, notification.metadata["score"]
    end

    test "an expired attempt notifies the technician that it was scored as submitted" do
      assessment = create_published_assessment!(slug: "notify_expired", time_limit_minutes: 5)
      user, profile = create_technician!
      attempt = StartAttempt.call(technician_profile: profile, assessment: assessment).attempt

      travel 6.minutes do
        AttemptExpirer.expire!(attempt.reload)
      end

      notification = AppNotification.where(user_id: user.id, category: "assessment").last
      assert_equal "attempt_expired", notification.metadata["event"]
    end
  end
end
