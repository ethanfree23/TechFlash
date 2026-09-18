# frozen_string_literal: true

# A single multiple-choice question in an assessment version's bank.
#
# The bank is intentionally larger than the number of questions served per
# attempt; Assessments::QuestionSelector draws from it. media_url/media_type
# exist so image-based questions can be added later without a schema change.
class AssessmentQuestion < ApplicationRecord
  include AssessmentContentImmutability

  enum difficulty: { easy: 0, medium: 1, hard: 2 }

  belongs_to :assessment_version, inverse_of: :assessment_questions
  belongs_to :assessment_category, inverse_of: :assessment_questions
  has_many :assessment_answer_choices, -> { order(:position, :id) },
           dependent: :destroy,
           inverse_of: :assessment_question
  has_many :assessment_attempt_questions, dependent: :restrict_with_error

  validates :prompt, presence: true
  validates :external_key, uniqueness: { scope: :assessment_version_id }, allow_nil: true
  validate :category_must_belong_to_same_version

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:position, :id) }

  delegate :assessment, to: :assessment_version

  def correct_answer_choices
    assessment_answer_choices.select(&:correct?)
  end

  def correct_answer_choice
    correct_answer_choices.first
  end

  # A question is only usable on an attempt if a technician can actually be
  # scored on it: at least two options and exactly one correct answer.
  def answer_key_complete?
    assessment_answer_choices.size >= 2 && correct_answer_choices.size == 1
  end

  def owning_assessment_version
    assessment_version
  end

  private

  def category_must_belong_to_same_version
    return if assessment_category.blank? || assessment_version_id.blank?
    return if assessment_category.assessment_version_id == assessment_version_id

    errors.add(:assessment_category, "must belong to the same assessment version")
  end
end
