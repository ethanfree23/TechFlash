# frozen_string_literal: true

# The answer sheet for one attempt: one row per question drawn for that attempt,
# created up front by Assessments::StartAttempt and never re-drawn afterwards.
#
# `position` freezes question order and `choice_order` freezes the shuffled
# answer-choice order, so resuming an attempt on another device shows exactly
# the same paper. `selected_answer_choice_id` and `correct` record the response;
# `correct` is only written server-side during scoring.
class AssessmentAttemptQuestion < ApplicationRecord
  belongs_to :assessment_attempt, inverse_of: :assessment_attempt_questions
  belongs_to :assessment_question
  belongs_to :assessment_category
  belongs_to :selected_answer_choice,
             class_name: "AssessmentAnswerChoice",
             optional: true

  validates :position, presence: true,
                       numericality: { only_integer: true, greater_than: 0 },
                       uniqueness: { scope: :assessment_attempt_id }
  validate :selected_choice_must_belong_to_question

  scope :ordered, -> { order(:position, :id) }
  scope :answered, -> { where.not(selected_answer_choice_id: nil) }

  def answered?
    selected_answer_choice_id.present?
  end

  # Choice ids in the order this attempt must display them. Falls back to the
  # question's canonical order if a snapshot is somehow missing.
  def presentation_choice_ids
    ids = Array(choice_order).map { |value| value.to_i }.reject(&:zero?)
    return ids if ids.any?

    assessment_question.assessment_answer_choices.ordered.pluck(:id)
  end

  private

  def selected_choice_must_belong_to_question
    return if selected_answer_choice_id.blank?
    return if selected_answer_choice&.assessment_question_id == assessment_question_id

    errors.add(:selected_answer_choice, "must be one of the question's answer choices")
  end
end
