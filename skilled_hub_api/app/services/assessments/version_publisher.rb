# frozen_string_literal: true

module Assessments
  # Owns the assessment version lifecycle: draft -> published -> retired, and
  # cloning a published version into a fresh editable draft.
  #
  # Publishing is the point of no return for content. Anything a technician
  # could be scored against is frozen from here, which is what lets an old score
  # keep pointing at the exact questions that produced it. Changing published
  # content therefore means clone -> edit the draft -> publish, which mints a new
  # version number and leaves prior attempts and results completely untouched.
  class VersionPublisher
    Result = Struct.new(:success, :version, :problems, :error_code, :error_message, keyword_init: true) do
      def success?
        success
      end
    end

    class << self
      def publish!(version)
        return failure(version, "already_published", "This version is already published.") if version.published?
        return failure(version, "version_retired", "Retired versions cannot be published.") if version.retired?

        problems = VersionValidator.new(version).problems
        if problems.any?
          return Result.new(
            success: false,
            version: version,
            problems: problems,
            error_code: "version_not_publishable",
            error_message: "This version cannot be published yet."
          )
        end

        ActiveRecord::Base.transaction do
          # Exactly one live version per assessment keeps "which version am I
          # being served" unambiguous for technicians and admins alike.
          version.assessment.assessment_versions
                 .published
                 .where.not(id: version.id)
                 .each { |other| retire!(other) }

          version.update!(
            status: :published,
            published_at: Time.current,
            question_count: version.effective_question_count
          )
        end

        Result.new(success: true, version: version.reload, problems: [])
      end

      def retire!(version)
        return failure(version, "already_retired", "This version is already retired.") if version.retired?

        version.update!(status: :retired, retired_at: Time.current)
        Result.new(success: true, version: version.reload, problems: [])
      end

      # Deep-copies a version's configuration and content into a new draft.
      # External keys are preserved so a subsequent content import can target
      # the same questions by key, and attempts against the source version are
      # not touched in any way.
      def clone_to_draft(source_version, attributes: {})
        assessment = source_version.assessment
        draft = nil

        ActiveRecord::Base.transaction do
          draft = assessment.assessment_versions.create!(
            version_number: assessment.next_version_number,
            status: :draft,
            instructions: source_version.instructions,
            question_count: source_version.question_count,
            time_limit_minutes: source_version.time_limit_minutes,
            passing_score: source_version.passing_score,
            max_attempts: source_version.max_attempts,
            retake_wait_hours: source_version.retake_wait_hours,
            randomize_questions: source_version.randomize_questions,
            randomize_answer_choices: source_version.randomize_answer_choices,
            allow_resume: source_version.allow_resume,
            allow_back_navigation: source_version.allow_back_navigation,
            scoring_strategy: source_version.scoring_strategy,
            score_bands: source_version.score_bands,
            metadata: source_version.metadata.merge("cloned_from_version_id" => source_version.id)
          )
          draft.update!(attributes.to_h.symbolize_keys) if attributes.present?

          category_map = {}
          source_version.assessment_categories.ordered.each do |category|
            clone = draft.assessment_categories.create!(
              slug: category.slug,
              name: category.name,
              description: category.description,
              question_count: category.question_count,
              weight: category.weight,
              position: category.position
            )
            category_map[category.id] = clone.id
          end

          source_version.assessment_questions.ordered.includes(:assessment_answer_choices).each do |question|
            clone = draft.assessment_questions.create!(
              assessment_category_id: category_map.fetch(question.assessment_category_id),
              external_key: question.external_key,
              prompt: question.prompt,
              explanation: question.explanation,
              difficulty: question.difficulty,
              active: question.active,
              position: question.position,
              media_url: question.media_url,
              media_type: question.media_type,
              media_alt_text: question.media_alt_text,
              metadata: question.metadata
            )

            question.assessment_answer_choices.ordered.each do |choice|
              clone.assessment_answer_choices.create!(
                external_key: choice.external_key,
                body: choice.body,
                correct: choice.correct,
                position: choice.position
              )
            end
          end
        end

        Result.new(success: true, version: draft.reload, problems: [])
      end

      private

      def failure(version, code, message)
        Result.new(success: false, version: version, problems: [message], error_code: code, error_message: message)
      end
    end
  end
end
