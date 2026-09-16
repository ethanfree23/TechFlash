# frozen_string_literal: true

# Assessment metadata safe for technicians and companies: what the assessment
# is, how long it takes, and the wording that keeps a score from being read as
# a certification. Carries no question content.
class AssessmentSerializer < ActiveModel::Serializer
  attributes :id,
             :slug,
             :title,
             :description,
             :trade_type,
             :active,
             :version_number,
             :assessment_version_id,
             :question_count,
             :time_limit_minutes,
             :estimated_minutes,
             :instructions,
             :max_attempts,
             :retake_wait_hours,
             :allow_resume,
             :allow_back_navigation,
             :score_bands,
             :topics,
             :disclaimer

  def live_version
    @live_version ||= object.live_version
  end

  def version_number
    live_version&.version_number
  end

  def assessment_version_id
    live_version&.id
  end

  def question_count
    live_version&.effective_question_count
  end

  def time_limit_minutes
    live_version&.time_limit_minutes
  end

  # What the technician-facing card shows ("Approximately 30 minutes"). Falls
  # back to a pace estimate when the assessment is untimed.
  def estimated_minutes
    return nil if live_version.blank?
    return live_version.time_limit_minutes if live_version.timed?

    count = live_version.effective_question_count.to_i
    return nil unless count.positive?

    (count * 0.75).ceil
  end

  def instructions
    live_version&.instructions
  end

  def max_attempts
    live_version&.max_attempts
  end

  def retake_wait_hours
    live_version&.retake_wait_hours
  end

  def allow_resume
    live_version&.allow_resume
  end

  def allow_back_navigation
    live_version&.allow_back_navigation
  end

  # Band labels are published so technicians and companies can read a score in
  # context. Thresholds are not secret; the answer key is.
  def score_bands
    live_version&.score_bands_config&.as_json || []
  end

  # What the assessment covers, so a technician can see the subject areas
  # before starting. Names and counts only — no question content.
  def topics
    return [] if live_version.blank?

    live_version.assessment_categories.ordered.map do |category|
      { slug: category.slug, name: category.name, question_count: category.question_count }
    end
  end

  def disclaimer
    Assessments::Disclaimer.for(object)
  end
end
