# frozen_string_literal: true

module Assessments
  # Moves attempts that ran past their time limit from in_progress to expired.
  #
  # Expiry is applied lazily on read/write paths rather than relying on a
  # scheduled job, so a technician whose app was backgrounded past the limit
  # sees a clean "this attempt expired" state on their very next request. The
  # rake task exists for housekeeping only; correctness does not depend on it.
  #
  # Expiring scores whatever was answered rather than discarding it, so a
  # partially completed timed attempt still yields an honest (lower) score
  # instead of vanishing.
  class AttemptExpirer
    def self.sweep_for(technician_profile:, assessment: nil)
      scope = AssessmentAttempt.in_progress.where(technician_profile_id: technician_profile.id)
      scope = scope.where(assessment_id: assessment.id) if assessment.present?
      sweep(scope)
    end

    def self.sweep(scope = AssessmentAttempt.in_progress)
      scope
        .where.not(expires_at: nil)
        .where(expires_at: ...Time.current)
        .find_each { |attempt| expire!(attempt) }
    end

    # Returns the attempt in its post-expiry state, or the untouched attempt
    # when it has not actually run out of time.
    def self.expire!(attempt)
      return attempt unless attempt.in_progress?
      return attempt unless attempt.past_time_limit?

      SubmitAttempt.call(attempt: attempt, reason: :expired).attempt || attempt.reload
    end
  end
end
