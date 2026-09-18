# frozen_string_literal: true

# A reporting/blueprint bucket inside one assessment version, for example
# "Safety & Tools". question_count is the blueprint: how many questions the
# engine draws from this category's bank for each attempt.
#
# Categories belong to a version rather than to the assessment so that two
# versions (and two different trades) can use entirely different category sets.
class AssessmentCategory < ApplicationRecord
  include AssessmentContentImmutability

  belongs_to :assessment_version, inverse_of: :assessment_categories
  has_many :assessment_questions, dependent: :destroy, inverse_of: :assessment_category
  has_many :assessment_attempt_questions, dependent: :restrict_with_error
  has_many :assessment_attempt_category_results, dependent: :destroy

  validates :slug, presence: true,
                   format: {
                     with: /\A[a-z0-9]+(?:_[a-z0-9]+)*\z/,
                     message: "must be lowercase letters, numbers and underscores"
                   },
                   uniqueness: { scope: :assessment_version_id }
  validates :name, presence: true
  validates :question_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :weight, numericality: { greater_than: 0 }

  scope :ordered, -> { order(:position, :id) }

  delegate :assessment, to: :assessment_version

  def active_question_pool
    assessment_questions.active
  end

  def active_question_pool_size
    active_question_pool.count
  end

  def owning_assessment_version
    assessment_version
  end
end
