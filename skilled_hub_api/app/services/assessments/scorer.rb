# frozen_string_literal: true

module Assessments
  # Computes an attempt's authoritative score. Pure calculation: it reads the
  # attempt's answer sheet and returns numbers, and never writes.
  #
  # Scoring is always server-side. The client never receives answer-key data, so
  # it cannot compute (or forge) a score.
  #
  # Normalization: the overall score is a 0-100 percentage, which keeps scores
  # comparable across assessments that serve different numbers of questions.
  # Unanswered questions count as incorrect, so a technician who submits half a
  # paper gets an honest low score rather than an inflated partial-credit one.
  #
  # Two strategies are supported:
  #   normalized_percent  - correct / total * 100 (every question equal)
  #   category_weighted   - weighted mean of the category percentages, using
  #                         each category's `weight`
  class Scorer
    CategoryScore = Struct.new(
      :assessment_category_id,
      :slug,
      :name,
      :position,
      :weight,
      :questions_count,
      :correct_count,
      :score,
      keyword_init: true
    )

    Result = Struct.new(
      :score,
      :raw_score,
      :total_questions,
      :answered_questions,
      :correct_answers,
      :category_scores,
      :score_band_slug,
      :score_band_label,
      :passed,
      keyword_init: true
    )

    attr_reader :attempt

    def self.call(attempt:)
      new(attempt: attempt).call
    end

    def initialize(attempt:)
      @attempt = attempt
    end

    def call
      rows = graded_rows
      categories = category_scores_for(rows)
      raw = overall_raw_score(rows, categories)
      score = raw.round.clamp(0, 100)
      band = attempt.score_bands_snapshot.resolve(score)

      Result.new(
        score: score,
        raw_score: raw,
        total_questions: rows.size,
        answered_questions: rows.count { |row| row[:answered] },
        correct_answers: rows.count { |row| row[:correct] },
        category_scores: categories,
        score_band_slug: band && band["slug"],
        score_band_label: band && band["label"],
        passed: pass_state(score)
      )
    end

    private

    # Grades each drawn question. Comparison is against the stored answer key of
    # the (immutable, published) version this attempt was drawn from.
    def graded_rows
      attempt_questions.map do |attempt_question|
        correct_choice_id = correct_choice_ids[attempt_question.assessment_question_id]
        selected_id = attempt_question.selected_answer_choice_id

        {
          record: attempt_question,
          assessment_category_id: attempt_question.assessment_category_id,
          answered: selected_id.present?,
          correct: selected_id.present? && selected_id == correct_choice_id
        }
      end
    end

    def attempt_questions
      @attempt_questions ||= attempt.assessment_attempt_questions.ordered.to_a
    end

    def correct_choice_ids
      @correct_choice_ids ||= AssessmentAnswerChoice
                              .correct
                              .where(assessment_question_id: attempt_questions.map(&:assessment_question_id))
                              .pluck(:assessment_question_id, :id)
                              .to_h
    end

    def category_scores_for(rows)
      grouped = rows.group_by { |row| row[:assessment_category_id] }

      snapshot_categories.filter_map do |category|
        category_rows = grouped[category["id"]]
        next nil if category_rows.blank?

        questions_count = category_rows.size
        correct_count = category_rows.count { |row| row[:correct] }

        CategoryScore.new(
          assessment_category_id: category["id"],
          slug: category["slug"],
          name: category["name"],
          position: category["position"].to_i,
          weight: category["weight"].to_f,
          questions_count: questions_count,
          correct_count: correct_count,
          score: percentage(correct_count, questions_count).round.clamp(0, 100)
        )
      end
    end

    # Categories as they were configured when the attempt started, so a renamed
    # or removed category in a newer version cannot alter this result.
    def snapshot_categories
      snapshot = Array(attempt.config_snapshot["categories"]).map { |entry| entry.to_h.stringify_keys }
      return snapshot if snapshot.any?

      attempt.assessment_version.assessment_categories.ordered.map do |category|
        {
          "id" => category.id,
          "slug" => category.slug,
          "name" => category.name,
          "weight" => category.weight.to_f,
          "position" => category.position
        }
      end
    end

    def overall_raw_score(rows, categories)
      return 0.0 if rows.empty?

      if weighted? && categories.any?
        total_weight = categories.sum { |category| category.weight.to_f }
        return percentage(rows.count { |row| row[:correct] }, rows.size) if total_weight <= 0

        weighted_sum = categories.sum { |category| category.score * category.weight.to_f }
        weighted_sum / total_weight
      else
        percentage(rows.count { |row| row[:correct] }, rows.size)
      end
    end

    def weighted?
      attempt.config_snapshot["scoring_strategy"].to_s == "category_weighted"
    end

    def percentage(numerator, denominator)
      return 0.0 if denominator.to_i.zero?

      (numerator.to_f / denominator) * 100
    end

    # nil (rather than false) when the version defines no passing score: these
    # are knowledge assessments, and "no benchmark configured" is not a failure.
    def pass_state(score)
      passing = attempt.config_snapshot["passing_score"]
      return nil if passing.nil? || passing.to_s.strip.empty?

      score >= passing.to_i
    end
  end
end
