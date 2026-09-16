# frozen_string_literal: true

# One technician's sitting of one assessment version.
#
# The attempt owns the immutable record of what happened: which questions were
# drawn (assessment_attempt_questions), what was answered, the normalized score,
# the per-category breakdown, and the score band label resolved *at completion
# time* so later threshold changes cannot rewrite history.
#
# technician_profile_id and user_id are both stored: the profile is the domain
# owner, and user_id keeps authorization checks and future analytics joins
# (jobs, ratings, hours, cancellations) a single hop away.
class AssessmentAttempt < ApplicationRecord
  enum status: { in_progress: 0, completed: 1, expired: 2 }

  belongs_to :technician_profile
  belongs_to :user
  belongs_to :assessment
  belongs_to :assessment_version
  has_many :assessment_attempt_questions, -> { order(:position, :id) },
           dependent: :destroy,
           inverse_of: :assessment_attempt
  has_many :assessment_questions, through: :assessment_attempt_questions
  has_many :assessment_attempt_category_results, -> { order(:position, :id) },
           dependent: :destroy,
           inverse_of: :assessment_attempt
  has_many :technician_assessment_results, dependent: :destroy

  validates :attempt_number, numericality: { only_integer: true, greater_than: 0 }
  validates :started_at, presence: true
  validates :score, numericality: { only_integer: true, in: 0..100 }, allow_nil: true

  scope :chronological, -> { order(:started_at, :id) }
  scope :recent_first, -> { order(started_at: :desc, id: :desc) }
  # Attempts eligible to become a technician's public result.
  scope :scored, -> { completed.where.not(score: nil) }

  # Wall-clock expiry, independent of the stored status, so a client that was
  # backgrounded past the limit is treated as expired on its next request even
  # before the sweeper touches the row.
  def past_time_limit?
    expires_at.present? && Time.current > expires_at
  end

  def live?
    in_progress? && !past_time_limit?
  end

  def remaining_seconds
    return nil if expires_at.blank?

    [(expires_at - Time.current).floor, 0].max
  end

  def resumable?
    in_progress? && !past_time_limit? && assessment_version.allow_resume?
  end

  def progress_percent
    return 0 if total_questions.to_i.zero?

    ((answered_questions.to_f / total_questions) * 100).round
  end

  # Score bands as configured when the attempt started, not as configured now.
  def score_bands_snapshot
    Assessments::ScoreBands.new(config_snapshot["score_bands"])
  end
end
