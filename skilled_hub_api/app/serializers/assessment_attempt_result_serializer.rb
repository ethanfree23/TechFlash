# frozen_string_literal: true

# A finished attempt as its own technician sees it: overall score, level,
# per-category breakdown and (optionally) a per-question review.
#
# The per-question review is only rendered for a finalized attempt and only for
# the owning technician, via instance_options[:include_review]. Rendering it
# mid-attempt would hand over the answer key, so the controller only ever sets
# that flag on a completed or expired attempt.
class AssessmentAttemptResultSerializer < ActiveModel::Serializer
  attributes :id,
             :status,
             :attempt_number,
             :assessment_id,
             :assessment_slug,
             :assessment_title,
             :assessment_version_id,
             :version_number,
             :score,
             :score_band_slug,
             :score_band_label,
             :passed,
             :total_questions,
             :answered_questions,
             :correct_answers,
             :duration_seconds,
             :started_at,
             :submitted_at,
             :completed_at,
             :time_limit_minutes,
             :category_results,
             :disclaimer

  attribute :question_review, if: :include_review?

  def assessment_slug
    object.assessment.slug
  end

  def assessment_title
    object.assessment.title
  end

  def version_number
    object.assessment_version.version_number
  end

  def category_results
    object.assessment_attempt_category_results.ordered.map do |result|
      {
        id: result.id,
        slug: result.category_slug,
        name: result.category_name,
        score: result.score,
        questions_count: result.questions_count,
        correct_count: result.correct_count
      }
    end
  end

  def disclaimer
    Assessments::Disclaimer.for(object.assessment)
  end

  def include_review?
    return false unless instance_options[:include_review]

    object.completed? || object.expired?
  end

  # Post-scoring review. Correctness and the explanation are only meaningful
  # once the attempt can no longer be changed.
  def question_review
    object
      .assessment_attempt_questions
      .ordered
      .includes(:assessment_category, assessment_question: :assessment_answer_choices)
      .map do |attempt_question|
        question = attempt_question.assessment_question

        {
          position: attempt_question.position,
          question_id: question.id,
          prompt: question.prompt,
          category: {
            slug: attempt_question.assessment_category.slug,
            name: attempt_question.assessment_category.name
          },
          answered: attempt_question.answered?,
          correct: attempt_question.correct,
          selected_answer_choice_id: attempt_question.selected_answer_choice_id,
          correct_answer_choice_id: question.correct_answer_choice&.id,
          explanation: question.explanation,
          choices: question.assessment_answer_choices.ordered.map do |choice|
            { id: choice.id, body: choice.body }
          end
        }
      end
  end
end
