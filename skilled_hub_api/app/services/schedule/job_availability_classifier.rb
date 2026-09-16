# frozen_string_literal: true

module Schedule
  # Classifies a job for a given technician so discovery can show overlapping jobs instead
  # of hiding them.
  #
  #   available          Normal claim.
  #   schedule_conflict  Visible; Claim opens an alternate-schedule proposal.
  #   unavailable        No valid way to perform the work under the job's constraints.
  class JobAvailabilityClassifier
    AVAILABLE = "available"
    SCHEDULE_CONFLICT = "schedule_conflict"
    UNAVAILABLE = "unavailable"

    Result = Struct.new(:classification, :conflict, :options, :reason, keyword_init: true) do
      def available?
        classification == AVAILABLE
      end

      def schedule_conflict?
        classification == SCHEDULE_CONFLICT
      end

      def unavailable?
        classification == UNAVAILABLE
      end

      def options
        Array(self[:options])
      end
    end

    def self.call(job:, technician_profile:, commitments: nil)
      return available_result if technician_profile.blank? || job.blank?

      # A rolling-start job has no window until it is claimed, so there is nothing to
      # compare yet; the claim path derives the schedule and re-checks at that point.
      return available_result if job.scheduled_start_at.blank? || job.scheduled_end_at.blank?

      commitments ||= ConflictDetector.commitments_for(technician_profile)
      conflict = ConflictDetector.call(
        technician_profile: technician_profile,
        job: job,
        commitments: commitments
      )
      return available_result(conflict) unless conflict.conflict?

      if conflict.indeterminate?
        return Result.new(
          classification: UNAVAILABLE,
          conflict: conflict,
          options: [],
          reason: "existing_assignment_schedule_unknown"
        )
      end

      options = AlternateScheduleProposer.call(
        technician_profile: technician_profile,
        job: job,
        conflict: conflict,
        commitments: commitments
      )

      if options.empty?
        return Result.new(
          classification: UNAVAILABLE,
          conflict: conflict,
          options: [],
          reason: "no_alternate_schedule_fits"
        )
      end

      Result.new(classification: SCHEDULE_CONFLICT, conflict: conflict, options: options, reason: nil)
    end

    # Classification plus the data the UI needs to explain it, without making the
    # technician work out any dates.
    def self.payload(job:, technician_profile:, commitments: nil)
      result = call(job: job, technician_profile: technician_profile, commitments: commitments)
      conflict = result.conflict

      {
        classification: result.classification,
        reason: result.reason,
        requested_start_at: job&.scheduled_start_at,
        requested_end_at: job&.scheduled_end_at,
        requested_days: job&.days,
        conflicting_job_ids: conflict ? conflict.conflicting_job_ids : [],
        conflicting_dates: conflict ? conflict.conflicting_dates.map(&:to_s) : [],
        committed_through_at: conflict&.committed_through_at,
        schedule_flexibility: job&.schedule_flexibility,
        options: result.options.map(&:as_json)
      }
    end

    def self.available_result(conflict = nil)
      Result.new(classification: AVAILABLE, conflict: conflict, options: [], reason: nil)
    end
    private_class_method :available_result
  end
end
