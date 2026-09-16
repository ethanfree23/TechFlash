# frozen_string_literal: true

module Assessments
  # Starts a new attempt, or returns the technician's existing live attempt.
  #
  # Starting is idempotent by design: a double-tapped "Take Assessment" button,
  # or the app reconnecting after a dropped connection, resumes rather than
  # burning an attempt. The database backs this with a partial unique index on
  # (technician_profile_id, assessment_id) WHERE status = 0, so even two
  # simultaneous requests cannot produce two live attempts.
  class StartAttempt
    Result = Struct.new(:success, :attempt, :resumed, :error_code, :error_message, keyword_init: true) do
      def success?
        success
      end

      def resumed?
        resumed
      end
    end

    attr_reader :technician_profile, :assessment

    def self.call(technician_profile:, assessment:)
      new(technician_profile: technician_profile, assessment: assessment).call
    end

    def initialize(technician_profile:, assessment:)
      @technician_profile = technician_profile
      @assessment = assessment
    end

    def call
      AttemptExpirer.sweep_for(technician_profile: technician_profile, assessment: assessment)

      version = assessment.live_version
      return failure("assessment_unavailable", "This assessment is not available yet.") if version.blank?
      return failure("assessment_inactive", "This assessment is not currently active.") unless assessment.active?

      decision = RetakePolicy.new(
        technician_profile: technician_profile,
        assessment: assessment,
        version: version
      ).decision

      return Result.new(success: true, attempt: decision.resumable_attempt, resumed: true) if decision.resumable_attempt.present?
      return failure(decision.reason, decision.message) unless decision.allowed?

      create_attempt(version)
    rescue QuestionSelector::InsufficientQuestions => e
      Rails.logger.error("Assessments::StartAttempt insufficient questions: #{e.message}")
      failure("assessment_incomplete", "This assessment is not ready yet. Please try again later.")
    rescue ActiveRecord::RecordNotUnique
      # Lost the race against a concurrent start; the winner's attempt is the
      # one we want.
      existing = live_attempt_for(version)
      return Result.new(success: true, attempt: existing, resumed: true) if existing.present?

      failure("attempt_conflict", "Another attempt is already in progress.")
    end

    private

    def create_attempt(version)
      selector = QuestionSelector.new(version: version)
      selections = selector.select
      started_at = Time.current

      attempt = nil
      ActiveRecord::Base.transaction do
        attempt = AssessmentAttempt.create!(
          technician_profile: technician_profile,
          user_id: technician_profile.user_id,
          assessment: assessment,
          assessment_version: version,
          attempt_number: next_attempt_number,
          status: :in_progress,
          started_at: started_at,
          last_activity_at: started_at,
          expires_at: version.timed? ? started_at + version.time_limit_minutes.minutes : nil,
          time_limit_minutes: version.time_limit_minutes,
          total_questions: selections.size,
          selection_seed: selector.seed,
          config_snapshot: config_snapshot_for(version)
        )

        rows = selections.map do |selection|
          {
            assessment_attempt_id: attempt.id,
            assessment_question_id: selection.question.id,
            assessment_category_id: selection.assessment_category_id,
            position: selection.position,
            choice_order: selection.choice_order,
            created_at: started_at,
            updated_at: started_at
          }
        end
        AssessmentAttemptQuestion.insert_all!(rows) if rows.any?
      end

      Result.new(success: true, attempt: attempt.reload, resumed: false)
    end

    # Snapshotting the rules the technician agreed to means later admin edits to
    # a *new* version can never change how this attempt is scored or labelled.
    def config_snapshot_for(version)
      {
        "assessment_slug" => assessment.slug,
        "assessment_title" => assessment.title,
        "version_number" => version.version_number,
        "question_count" => version.effective_question_count,
        "time_limit_minutes" => version.time_limit_minutes,
        "passing_score" => version.passing_score,
        "scoring_strategy" => version.scoring_strategy,
        "max_attempts" => version.max_attempts,
        "retake_wait_hours" => version.retake_wait_hours,
        "allow_resume" => version.allow_resume?,
        "allow_back_navigation" => version.allow_back_navigation?,
        "score_bands" => version.score_bands_config.as_json,
        "categories" => version.assessment_categories.ordered.map do |category|
          {
            "id" => category.id,
            "slug" => category.slug,
            "name" => category.name,
            "question_count" => category.question_count,
            "weight" => category.weight.to_f,
            "position" => category.position
          }
        end
      }
    end

    def next_attempt_number
      current = AssessmentAttempt.where(
        technician_profile_id: technician_profile.id,
        assessment_id: assessment.id
      ).maximum(:attempt_number).to_i
      current + 1
    end

    def live_attempt_for(version)
      AssessmentAttempt
        .where(technician_profile_id: technician_profile.id, assessment_id: assessment.id)
        .in_progress
        .order(started_at: :desc, id: :desc)
        .first
    end

    def failure(code, message)
      Result.new(success: false, attempt: nil, resumed: false, error_code: code, error_message: message)
    end
  end
end
