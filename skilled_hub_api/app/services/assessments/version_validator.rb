# frozen_string_literal: true

module Assessments
  # Collects every reason an assessment version cannot be served to technicians.
  #
  # Used as the publish gate (a version that would fail mid-attempt must never
  # become live) and surfaced in the admin API so content authors see all gaps
  # at once instead of fixing them one round-trip at a time.
  class VersionValidator
    attr_reader :version

    def initialize(version)
      @version = version
    end

    def problems
      list = []
      list.concat(configuration_problems)
      list.concat(blueprint_problems)
      list.concat(question_problems)
      list
    end

    def valid?
      problems.empty?
    end

    private

    def configuration_problems
      list = []
      list << "score_bands are invalid: #{version.score_bands_config.errors.join('; ')}" unless version.score_bands_config.valid?

      if version.passing_score.present? && !version.score_bands_config.present?
        # Not fatal, but worth stating plainly: pass/fail without bands means
        # companies see a number with no level label next to it.
        list << "passing_score is set but no score bands are configured"
      end

      list
    end

    def blueprint_problems
      list = []
      categories = version.assessment_categories.ordered.to_a

      list << "at least one category is required" if categories.empty?

      if version.blueprint?
        if version.question_count.to_i.positive? && version.question_count != version.blueprint_total
          list << "question_count (#{version.question_count}) must equal the sum of category " \
                  "question_count values (#{version.blueprint_total})"
        end
      elsif version.question_count.to_i <= 0
        list << "question_count must be greater than zero"
      end

      categories.each do |category|
        required = category.question_count.to_i
        next unless required.positive?

        available = usable_question_count(category)
        next if available >= required

        list << "category #{category.slug} needs #{required} usable questions but only #{available} are available"
      end

      if !version.blueprint? && version.question_count.to_i.positive?
        available = categories.sum { |category| usable_question_count(category) }
        if available < version.question_count.to_i
          list << "version needs #{version.question_count} usable questions but only #{available} are available"
        end
      end

      list
    end

    def question_problems
      incomplete = version.assessment_questions
                          .active
                          .includes(:assessment_answer_choices)
                          .reject(&:answer_key_complete?)
      return [] if incomplete.empty?

      identifiers = incomplete.first(10).map { |question| question.external_key.presence || "##{question.id}" }
      suffix = incomplete.size > 10 ? " (and #{incomplete.size - 10} more)" : ""
      ["#{incomplete.size} active question(s) need exactly one correct answer and at least two choices: " \
       "#{identifiers.join(', ')}#{suffix}"]
    end

    def usable_question_count(category)
      @usable_counts ||= {}
      @usable_counts[category.id] ||= category
                                      .assessment_questions
                                      .active
                                      .includes(:assessment_answer_choices)
                                      .count(&:answer_key_complete?)
    end
  end
end
