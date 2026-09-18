# frozen_string_literal: true

module Assessments
  # Draws the question paper for one attempt, server-side only.
  #
  # The bank is deliberately larger than the paper. Selection honours the
  # version's category blueprint ("10 from Safety & Tools, 10 from
  # Diagnostics, ..."), so category scores stay comparable between technicians
  # even though they answered different questions.
  #
  # Every draw is seeded. The seed is persisted on the attempt, which makes a
  # selection reproducible for support and testing while still being unguessable
  # from the client. The result is written to assessment_attempt_questions once
  # and never re-drawn: resuming an attempt replays the stored paper.
  class QuestionSelector
    Selection = Struct.new(:question, :assessment_category_id, :position, :choice_order, keyword_init: true)

    class InsufficientQuestions < StandardError; end

    attr_reader :version, :seed

    def self.generate_seed
      SecureRandom.hex(16)
    end

    def initialize(version:, seed: nil)
      @version = version
      @seed = seed.presence || self.class.generate_seed
    end

    # Returns an ordered Array<Selection>. Raises InsufficientQuestions when the
    # bank cannot satisfy the blueprint, so an attempt is never created against
    # a version that would run out of questions mid-sitting.
    def select
      drawn = version.blueprint? ? draw_by_blueprint : draw_at_large
      ordered = order_questions(drawn)

      ordered.each_with_index.map do |question, index|
        Selection.new(
          question: question,
          assessment_category_id: question.assessment_category_id,
          position: index + 1,
          choice_order: choice_order_for(question)
        )
      end
    end

    private

    def draw_by_blueprint
      version.assessment_categories.ordered.flat_map do |category|
        required = category.question_count.to_i
        next [] unless required.positive?

        pool = usable_pool.fetch(category.id, [])
        if pool.size < required
          raise InsufficientQuestions,
                "category #{category.slug} needs #{required} usable questions but only #{pool.size} are available"
        end

        shuffle(pool, salt: "category:#{category.id}").first(required)
      end
    end

    def draw_at_large
      required = version.question_count.to_i
      pool = usable_pool.values.flatten
      if pool.size < required
        raise InsufficientQuestions,
              "assessment version needs #{required} usable questions but only #{pool.size} are available"
      end

      shuffle(pool, salt: "at_large").first(required)
    end

    # Questions grouped by category, excluding anything a technician could not
    # be fairly scored on (inactive, or a broken answer key).
    def usable_pool
      @usable_pool ||= version
                       .assessment_questions
                       .active
                       .includes(:assessment_answer_choices)
                       .ordered
                       .select(&:answer_key_complete?)
                       .group_by(&:assessment_category_id)
    end

    def order_questions(questions)
      return shuffle(questions, salt: "paper") if version.randomize_questions?

      category_positions = version.assessment_categories.ordered.each_with_index.to_h do |category, index|
        [category.id, index]
      end

      questions.sort_by do |question|
        [category_positions.fetch(question.assessment_category_id, Float::INFINITY), question.position, question.id]
      end
    end

    def choice_order_for(question)
      choices = question.assessment_answer_choices.sort_by { |choice| [choice.position, choice.id] }
      ordered = version.randomize_answer_choices? ? shuffle(choices, salt: "choices:#{question.id}") : choices
      ordered.map(&:id)
    end

    # Deterministic per (seed, salt) so each category and each question's choice
    # list gets an independent but reproducible shuffle.
    def shuffle(collection, salt:)
      collection.shuffle(random: Random.new(random_seed_for(salt)))
    end

    def random_seed_for(salt)
      Digest::SHA256.hexdigest("#{seed}:#{salt}").to_i(16) % (2**62)
    end
  end
end
