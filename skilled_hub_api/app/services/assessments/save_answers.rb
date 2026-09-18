# frozen_string_literal: true

module Assessments
  # Persists answers for an in-progress attempt.
  #
  # The client saves as it goes rather than only at submit, which is what makes
  # an attempt survive the app being backgrounded, killed, or losing
  # connectivity: whatever reached the server is already durable, and resuming
  # replays it.
  #
  # Saves are idempotent (re-sending the same answer is a no-op) and tolerant of
  # out-of-order delivery, so a retried request after a flaky connection is
  # safe. `correct` is never written here; grading happens only in SubmitAttempt.
  class SaveAnswers
    Result = Struct.new(:success, :attempt, :saved_count, :error_code, :error_message, keyword_init: true) do
      def success?
        success
      end
    end

    attr_reader :attempt, :answers

    # answers: [{ "question_id" => 12, "answer_choice_id" => 48 }, ...]
    # An explicit null answer_choice_id clears a previous selection.
    def self.call(attempt:, answers:)
      new(attempt: attempt, answers: answers).call
    end

    def initialize(attempt:, answers:)
      @attempt = attempt
      @raw_answers = answers
    end

    def call
      entries = normalized_entries
      if entries.nil?
        return failure("invalid_answers",
                       "answers must be a list of { question_id, answer_choice_id } entries.")
      end

      # Expiry is reported with its own code — whoever noticed the clock first —
      # so a client can say "time is up" rather than a generic "attempt closed".
      return failure("attempt_expired", "Time is up for this attempt.") if attempt.expired?
      return failure("attempt_not_in_progress", "This attempt is no longer open.") unless attempt.in_progress?

      if attempt.past_time_limit?
        AttemptExpirer.expire!(attempt)
        return failure("attempt_expired", "Time is up for this attempt.")
      end

      saved = 0
      ActiveRecord::Base.transaction do
        entries.each do |entry|
          attempt_question = attempt_questions[entry["question_id"].to_i]
          next if attempt_question.blank?

          choice_id = resolve_choice_id(attempt_question, entry)
          next if choice_id == :invalid
          next if attempt_question.selected_answer_choice_id == choice_id

          attempt_question.update!(
            selected_answer_choice_id: choice_id,
            answered_at: choice_id.present? ? Time.current : nil
          )
          saved += 1
        end

        refresh_progress!
      end

      Result.new(success: true, attempt: attempt.reload, saved_count: saved)
    end

    private

    # Returns nil for a payload that is not a list of hashes, so a malformed
    # request is reported rather than silently saving nothing.
    def normalized_entries
      return [] if @raw_answers.nil?
      return nil unless @raw_answers.is_a?(Array)

      @raw_answers.map do |raw|
        hash =
          if raw.respond_to?(:to_unsafe_h)
            raw.to_unsafe_h
          elsif raw.is_a?(Hash)
            raw
          end
        return nil if hash.nil?

        hash.stringify_keys
      end
    end

    def attempt_questions
      @attempt_questions ||= attempt
                             .assessment_attempt_questions
                             .ordered
                             .index_by(&:assessment_question_id)
    end

    # Only choices belonging to the drawn question are accepted, so a client
    # cannot attach an arbitrary choice id to a question.
    def resolve_choice_id(attempt_question, entry)
      return nil unless entry.key?("answer_choice_id")

      raw = entry["answer_choice_id"]
      return nil if raw.nil? || raw.to_s.strip.empty?

      choice_id = raw.to_i
      return :invalid unless attempt_question.presentation_choice_ids.include?(choice_id)

      choice_id
    end

    def refresh_progress!
      answered = attempt.assessment_attempt_questions.answered.count
      attempt.update!(answered_questions: answered, last_activity_at: Time.current)
    end

    def failure(code, message)
      Result.new(success: false, attempt: attempt, saved_count: 0, error_code: code, error_message: message)
    end
  end
end
