# frozen_string_literal: true

module Assessments
  # Finalizes an attempt: grades it, writes the score and category breakdown,
  # refreshes the technician's public result and notifies them.
  #
  # Duplicate-submission safety comes from a row lock plus a status re-check
  # inside the transaction. A second submit (double tap, client retry after a
  # dropped response) returns the already-scored attempt untouched instead of
  # rescoring or incrementing anything.
  class SubmitAttempt
    Result = Struct.new(:success, :attempt, :already_finalized, :error_code, :error_message, keyword_init: true) do
      def success?
        success
      end

      def already_finalized?
        already_finalized
      end
    end

    attr_reader :attempt, :reason

    # reason: :submitted for a technician-initiated submit, :expired when the
    # time limit ran out.
    def self.call(attempt:, reason: :submitted)
      new(attempt: attempt, reason: reason).call
    end

    def initialize(attempt:, reason: :submitted)
      @attempt = attempt
      @reason = reason
    end

    def call
      finalized_state = nil

      attempt.with_lock do
        attempt.reload
        if attempt.completed? || attempt.expired?
          finalized_state = :already
        else
          finalize!
          finalized_state = :finalized
        end
      end

      return Result.new(success: true, attempt: attempt.reload, already_finalized: true) if finalized_state == :already

      after_commit_side_effects
      Result.new(success: true, attempt: attempt.reload, already_finalized: false)
    end

    private

    def finalize!
      scored = Scorer.call(attempt: attempt)
      now = Time.current

      attempt.assessment_attempt_questions.ordered.each do |attempt_question|
        correct = correct_for(attempt_question)
        next if attempt_question.correct == correct

        attempt_question.update_columns(correct: correct, updated_at: now)
      end

      attempt.assessment_attempt_category_results.delete_all
      scored.category_scores.each do |category|
        AssessmentAttemptCategoryResult.create!(
          assessment_attempt: attempt,
          assessment_category_id: category.assessment_category_id,
          category_slug: category.slug,
          category_name: category.name,
          questions_count: category.questions_count,
          correct_count: category.correct_count,
          score: category.score,
          position: category.position
        )
      end

      attempt.update!(
        status: expired_submission? ? :expired : :completed,
        submitted_at: attempt.submitted_at || now,
        completed_at: now,
        last_activity_at: now,
        duration_seconds: duration_seconds(now),
        score: scored.score,
        raw_score: scored.raw_score,
        total_questions: scored.total_questions,
        answered_questions: scored.answered_questions,
        correct_answers: scored.correct_answers,
        score_band_slug: scored.score_band_slug,
        score_band_label: scored.score_band_label,
        passed: scored.passed
      )
    end

    def expired_submission?
      reason.to_sym == :expired || attempt.past_time_limit?
    end

    # An expired attempt is still scored on what was answered, so it stays
    # eligible to become a public result if it happens to be the best one.
    def duration_seconds(now)
      reference = expired_submission? ? (attempt.expires_at || now) : now
      [(reference - attempt.started_at).round, 0].max
    end

    def correct_for(attempt_question)
      return false if attempt_question.selected_answer_choice_id.blank?

      attempt_question.selected_answer_choice_id == correct_choice_ids[attempt_question.assessment_question_id]
    end

    def correct_choice_ids
      @correct_choice_ids ||= AssessmentAnswerChoice
                              .correct
                              .where(assessment_question_id: attempt.assessment_attempt_questions.select(:assessment_question_id))
                              .pluck(:assessment_question_id, :id)
                              .to_h
    end

    def after_commit_side_effects
      PublicResultProjector.call(
        technician_profile: attempt.technician_profile,
        assessment: attempt.assessment
      )
      AssessmentEventNotifier.attempt_finalized(attempt.reload)
    rescue StandardError => e
      # A notification or projection hiccup must never lose a submitted score.
      Rails.logger.error("Assessments::SubmitAttempt side effects failed for attempt #{attempt.id}: #{e.class}: #{e.message}")
    end
  end
end
