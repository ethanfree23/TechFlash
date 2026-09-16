# frozen_string_literal: true

# One selectable option for a question. `correct` is answer-key data and must
# never reach technician- or company-facing serializers; only
# Admin::AssessmentAnswerChoiceSerializer exposes it.
class AssessmentAnswerChoice < ApplicationRecord
  include AssessmentContentImmutability

  belongs_to :assessment_question, inverse_of: :assessment_answer_choices

  validates :body, presence: true
  validates :external_key, uniqueness: { scope: :assessment_question_id }, allow_nil: true

  scope :ordered, -> { order(:position, :id) }
  scope :correct, -> { where(correct: true) }

  def owning_assessment_version
    assessment_question&.assessment_version
  end
end
