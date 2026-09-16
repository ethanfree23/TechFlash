# frozen_string_literal: true

module Assessments
  # Decides whether a technician may start (or resume) an assessment right now.
  #
  # Both limits are optional per version: max_attempts nil means unlimited, and
  # retake_wait_hours nil/0 means no cooling-off period. With both unset — the
  # expected launch configuration — this always allows a new attempt.
  #
  # Attempts are counted across every version of the assessment, so publishing
  # version 2 does not silently hand out a fresh allowance. Scoping the count to
  # a single version instead is a one-line change here.
  class RetakePolicy
    Decision = Struct.new(
      :allowed,
      :reason,
      :message,
      :attempts_used,
      :max_attempts,
      :available_at,
      :resumable_attempt,
      keyword_init: true
    ) do
      def allowed?
        allowed
      end

      def as_json(*)
        {
          "allowed" => allowed?,
          "reason" => reason,
          "message" => message,
          "attempts_used" => attempts_used,
          "max_attempts" => max_attempts,
          "available_at" => available_at
        }
      end
    end

    attr_reader :technician_profile, :assessment, :version

    def initialize(technician_profile:, assessment:, version: nil)
      @technician_profile = technician_profile
      @assessment = assessment
      @version = version || assessment.live_version
    end

    def decision
      return unavailable_decision if version.blank?

      resumable = resumable_attempt
      return allow(resumable_attempt: resumable, reason: "resume") if resumable.present?

      if max_attempts.present? && attempts_used >= max_attempts
        return deny(
          reason: "max_attempts_reached",
          message: "You have used all #{max_attempts} attempts for this assessment."
        )
      end

      if wait_until.present? && Time.current < wait_until
        return deny(
          reason: "waiting_period",
          message: "You can retake this assessment on #{wait_until.strftime('%b %-d, %Y at %-l:%M %p %Z')}.",
          available_at: wait_until
        )
      end

      allow(reason: "eligible")
    end

    # Attempts that count against the allowance: anything the technician
    # finished or let expire. A live in-progress attempt is not counted twice —
    # it is resumed.
    def attempts_used
      @attempts_used ||= scoped_attempts.where(status: %i[completed expired]).count
    end

    def max_attempts
      version&.max_attempts
    end

    def last_completed_attempt
      @last_completed_attempt ||= scoped_attempts.completed.order(completed_at: :desc, id: :desc).first
    end

    # An in-progress attempt this technician can pick up again. Attempts past
    # their time limit are not resumable; they are swept to `expired` by
    # Assessments::AttemptExpirer on the next read.
    def resumable_attempt
      return nil if version.blank?

      candidate = scoped_attempts.in_progress.order(started_at: :desc, id: :desc).first
      return nil if candidate.blank?
      return nil if candidate.past_time_limit?
      return nil unless candidate.assessment_version.allow_resume?

      candidate
    end

    private

    def scoped_attempts
      AssessmentAttempt.where(
        technician_profile_id: technician_profile.id,
        assessment_id: assessment.id
      )
    end

    def wait_until
      return nil if version.retake_wait_hours.to_i <= 0

      completed_at = last_completed_attempt&.completed_at
      return nil if completed_at.blank?

      completed_at + version.retake_wait_hours.to_i.hours
    end

    def allow(reason:, resumable_attempt: nil)
      Decision.new(
        allowed: true,
        reason: reason,
        message: nil,
        attempts_used: attempts_used,
        max_attempts: max_attempts,
        available_at: nil,
        resumable_attempt: resumable_attempt
      )
    end

    def deny(reason:, message:, available_at: nil)
      Decision.new(
        allowed: false,
        reason: reason,
        message: message,
        attempts_used: attempts_used,
        max_attempts: max_attempts,
        available_at: available_at,
        resumable_attempt: nil
      )
    end

    def unavailable_decision
      Decision.new(
        allowed: false,
        reason: "no_published_version",
        message: "This assessment is not available yet.",
        attempts_used: 0,
        max_attempts: nil,
        available_at: nil,
        resumable_attempt: nil
      )
    end
  end
end
