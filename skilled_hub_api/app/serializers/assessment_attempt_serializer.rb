# frozen_string_literal: true

# The live question paper for an in-progress attempt.
#
# Security-critical payload. It exposes only what a technician needs in order to
# answer: prompt text, choice bodies in this attempt's frozen order, and their
# own current selection. It never includes `correct`, and it withholds
# `explanation` (which describes the right answer) until the attempt is scored.
# That is what makes frontend-side scoring impossible and keeps the answer key
# out of a network inspector.
class AssessmentAttemptSerializer < ActiveModel::Serializer
  attributes :id,
             :status,
             :attempt_number,
             :assessment_id,
             :assessment_slug,
             :assessment_title,
             :assessment_version_id,
             :version_number,
             :started_at,
             :expires_at,
             :remaining_seconds,
             :time_limit_minutes,
             :total_questions,
             :answered_questions,
             :progress_percent,
             :allow_resume,
             :allow_back_navigation,
             :questions

  def assessment_slug
    object.assessment.slug
  end

  def assessment_title
    object.assessment.title
  end

  def version_number
    object.assessment_version.version_number
  end

  def remaining_seconds
    object.remaining_seconds
  end

  def progress_percent
    object.progress_percent
  end

  def allow_resume
    object.assessment_version.allow_resume
  end

  def allow_back_navigation
    object.assessment_version.allow_back_navigation
  end

  def questions
    attempt_questions.map do |attempt_question|
      question = attempt_question.assessment_question
      category = attempt_question.assessment_category

      {
        id: attempt_question.id,
        question_id: question.id,
        position: attempt_question.position,
        prompt: question.prompt,
        difficulty: question.difficulty,
        category: {
          id: category.id,
          slug: category.slug,
          name: category.name
        },
        media: media_for(question),
        selected_answer_choice_id: attempt_question.selected_answer_choice_id,
        choices: ordered_choices(attempt_question)
      }
    end
  end

  private

  def attempt_questions
    @attempt_questions ||= object
                           .assessment_attempt_questions
                           .ordered
                           .includes(:assessment_category, assessment_question: :assessment_answer_choices)
                           .to_a
  end

  # Replays the shuffle recorded when the attempt started, so resuming on a
  # different device shows the same paper in the same order.
  def ordered_choices(attempt_question)
    by_id = attempt_question.assessment_question.assessment_answer_choices.index_by(&:id)

    attempt_question.presentation_choice_ids.filter_map do |choice_id|
      choice = by_id[choice_id]
      next nil if choice.blank?

      { id: choice.id, body: choice.body }
    end
  end

  def media_for(question)
    return nil if question.media_url.blank?

    {
      url: question.media_url,
      type: question.media_type,
      alt_text: question.media_alt_text
    }
  end
end
