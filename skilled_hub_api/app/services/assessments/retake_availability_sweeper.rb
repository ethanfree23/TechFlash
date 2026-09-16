# frozen_string_literal: true

module Assessments
  # Notifies technicians once a configured retake waiting period has elapsed.
  #
  # Only relevant for assessments that set retake_wait_hours; with no waiting
  # period there is nothing to announce, so this does no work at launch
  # configuration. Driven by the assessments:notify_retakes rake task.
  class RetakeAvailabilitySweeper
    def self.call(now: Time.current)
      new(now: now).call
    end

    attr_reader :now

    def initialize(now: Time.current)
      @now = now
    end

    def call
      notified = 0

      Assessment.active.includes(:assessment_versions).find_each do |assessment|
        version = assessment.live_version
        wait_hours = version&.retake_wait_hours.to_i
        next unless wait_hours.positive?

        eligible_attempts(assessment, wait_hours).each do |attempt|
          next if already_notified?(attempt)
          next unless RetakePolicy.new(
            technician_profile: attempt.technician_profile,
            assessment: assessment,
            version: version
          ).decision.allowed?

          AssessmentEventNotifier.retake_available(
            technician_profile: attempt.technician_profile,
            assessment: assessment
          )
          notified += 1
        end
      end

      notified
    end

    private

    # The most recent completed attempt per technician whose waiting period just
    # elapsed. A one-day trailing window keeps this idempotent enough for a
    # daily task without needing extra state.
    def eligible_attempts(assessment, wait_hours)
      window_end = now - wait_hours.hours
      window_start = window_end - 1.day

      AssessmentAttempt
        .where(assessment_id: assessment.id)
        .completed
        .where(completed_at: window_start...window_end)
        .includes(:technician_profile)
        .select { |attempt| latest_completed_id(assessment, attempt.technician_profile_id) == attempt.id }
    end

    def latest_completed_id(assessment, technician_profile_id)
      @latest_completed ||= {}
      @latest_completed[[assessment.id, technician_profile_id]] ||= AssessmentAttempt
        .where(assessment_id: assessment.id, technician_profile_id: technician_profile_id)
        .completed
        .order(completed_at: :desc, id: :desc)
        .limit(1)
        .pick(:id)
    end

    def already_notified?(attempt)
      AppNotification
        .where(user_id: attempt.user_id, category: AssessmentEventNotifier::CATEGORY)
        .where("created_at > ?", attempt.completed_at)
        .any? do |notification|
          metadata = notification.metadata || {}
          metadata["event"] == "retake_available" && metadata["assessment_id"].to_i == attempt.assessment_id
        end
    end
  end
end
