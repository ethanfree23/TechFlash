# frozen_string_literal: true

# An immutable-once-published snapshot of an assessment's content and rules.
#
# Drafts are freely editable. Publishing freezes the version: its configuration,
# categories, questions and answer choices can no longer change, which is what
# keeps a score recorded against version 1 meaningful after version 2 launches.
# Editing published content means cloning into a new draft version instead
# (see Assessments::VersionPublisher).
class AssessmentVersion < ApplicationRecord
  SCORING_STRATEGIES = %w[normalized_percent category_weighted].freeze

  # Configuration and content are locked from this state onward.
  FROZEN_STATUSES = %w[published retired].freeze

  # The only columns that may change once a version is published; everything
  # else is part of the historical record.
  MUTABLE_AFTER_PUBLISH = %w[status retired_at updated_at].freeze

  enum status: { draft: 0, published: 1, retired: 2 }

  belongs_to :assessment
  has_many :assessment_categories, -> { order(:position, :id) },
           dependent: :destroy,
           inverse_of: :assessment_version
  has_many :assessment_questions, dependent: :destroy, inverse_of: :assessment_version
  has_many :assessment_answer_choices, through: :assessment_questions
  has_many :assessment_attempts, dependent: :restrict_with_error

  validates :version_number, presence: true,
                             numericality: { only_integer: true, greater_than: 0 },
                             uniqueness: { scope: :assessment_id }
  validates :question_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :time_limit_minutes, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
  validates :passing_score, numericality: { only_integer: true, in: 0..100 }, allow_nil: true
  validates :max_attempts, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
  validates :retake_wait_hours, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :scoring_strategy, inclusion: { in: SCORING_STRATEGIES }
  validate :score_bands_must_be_valid
  validate :published_content_must_not_change

  scope :live, -> { published.order(version_number: :desc) }

  def frozen_content?
    FROZEN_STATUSES.include?(status.to_s)
  end

  def editable?
    draft?
  end

  def timed?
    time_limit_minutes.to_i.positive?
  end

  def score_bands_config
    Assessments::ScoreBands.new(score_bands)
  end

  # Blueprint counts declared per category. When categories declare counts the
  # blueprint drives selection; otherwise question_count is drawn at large.
  def blueprint_total
    assessment_categories.sum(:question_count)
  end

  def blueprint?
    blueprint_total.positive?
  end

  def effective_question_count
    blueprint? ? blueprint_total : question_count
  end

  def attempts_recorded?
    assessment_attempts.exists?
  end

  # Collects every reason this version cannot be served to technicians. Used by
  # the admin publish endpoint so content authors see all gaps at once.
  def publication_problems
    Assessments::VersionValidator.new(self).problems
  end

  private

  def score_bands_must_be_valid
    config = score_bands_config
    return if config.valid?

    config.errors.each { |message| errors.add(:score_bands, message) }
  end

  def published_content_must_not_change
    return if new_record?
    return unless FROZEN_STATUSES.include?(status_was.to_s)

    illegal = changed - MUTABLE_AFTER_PUBLISH
    return if illegal.empty?

    errors.add(
      :base,
      "Published assessment versions are immutable. Create a new version to change: #{illegal.sort.join(', ')}."
    )
  end
end
