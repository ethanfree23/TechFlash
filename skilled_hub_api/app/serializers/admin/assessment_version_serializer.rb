# frozen_string_literal: true

module Admin
  # Admin view of one assessment version: its rules, its blueprint, and whether
  # it is publishable right now.
  #
  # `publication_problems` is the publish gate surfaced for authoring, so an
  # admin sees every gap (short category banks, broken answer keys, invalid
  # bands) in one read rather than one failed publish at a time.
  class AssessmentVersionSerializer < ActiveModel::Serializer
    attributes :id,
               :assessment_id,
               :version_number,
               :status,
               :instructions,
               :question_count,
               :blueprint_total,
               :effective_question_count,
               :time_limit_minutes,
               :passing_score,
               :max_attempts,
               :retake_wait_hours,
               :randomize_questions,
               :randomize_answer_choices,
               :allow_resume,
               :allow_back_navigation,
               :scoring_strategy,
               :score_bands,
               :published_at,
               :retired_at,
               :editable,
               :attempts_count,
               :completed_attempts_count,
               :publication_problems,
               :publishable,
               :created_at,
               :updated_at

    has_many :assessment_categories, serializer: Admin::AssessmentCategorySerializer

    def blueprint_total
      object.blueprint_total
    end

    def effective_question_count
      object.effective_question_count
    end

    def score_bands
      object.score_bands_config.as_json
    end

    def editable
      object.editable?
    end

    def attempts_count
      object.assessment_attempts.count
    end

    def completed_attempts_count
      object.assessment_attempts.completed.count
    end

    def publication_problems
      problems
    end

    def publishable
      object.draft? && problems.empty?
    end

    private

    def problems
      @problems ||= object.publication_problems
    end
  end
end
