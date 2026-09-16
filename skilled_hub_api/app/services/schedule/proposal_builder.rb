# frozen_string_literal: true

module Schedule
  # Builds the structured schedule fields for a JobCounterOffer from the option a
  # technician picked.
  #
  # Dates are always recomputed here rather than trusted from the client, so a technician
  # cannot propose a window that does not follow the job's working schedule or that still
  # double-books them.
  class ProposalBuilder
    Result = Struct.new(:ok, :error, :attributes, :option, :conflict, keyword_init: true) do
      def ok?
        !!ok
      end
    end

    VALID_OPTIONS = %w[start_after_conflict keep_original_end].freeze

    def self.call(job:, technician_profile:, schedule_option:)
      option_key = schedule_option.to_s
      unless VALID_OPTIONS.include?(option_key)
        return Result.new(ok: false, error: "Unknown schedule option '#{option_key}'.")
      end

      commitments = ConflictDetector.commitments_for(technician_profile)
      conflict = ConflictDetector.call(
        technician_profile: technician_profile,
        job: job,
        commitments: commitments
      )

      unless conflict.conflict?
        return Result.new(
          ok: false,
          error: "This job no longer conflicts with your schedule. Claim it directly instead.",
          conflict: conflict
        )
      end

      if conflict.indeterminate?
        return Result.new(
          ok: false,
          error: "One of your current assignments has no confirmed schedule, so an alternate schedule cannot be calculated.",
          conflict: conflict
        )
      end

      options = AlternateScheduleProposer.call(
        technician_profile: technician_profile,
        job: job,
        conflict: conflict,
        commitments: commitments
      )
      option = options.find { |o| o.kind.to_s == option_key }

      if option.blank?
        return Result.new(
          ok: false,
          error: "That alternate schedule is not available for this job.",
          conflict: conflict
        )
      end

      Result.new(ok: true, option: option, conflict: conflict, attributes: attributes_for(job, conflict, option))
    end

    def self.attributes_for(job, conflict, option)
      {
        proposal_kind: :schedule,
        proposal_reason: :schedule_conflict,
        schedule_option: option.kind,
        proposed_start_at: option.start_at,
        proposed_end_at: option.end_at,
        proposed_days: option.days,
        proposed_start_mode: :hard_start,
        original_start_at: job.scheduled_start_at,
        original_end_at: job.scheduled_end_at,
        original_days: option.requested_days,
        proposed_working_dates: Array(option.working_dates).map(&:to_s),
        unavailable_working_dates: Array(option.unavailable_dates).map(&:to_s),
        conflicting_job_ids: conflict.conflicting_job_ids,
        committed_through_at: conflict.committed_through_at,
        full_duration_offered: option.full_duration,
        partial_duration: option.partial,
        schedule_signature: ProposalSignature.for(job)
      }
    end
    private_class_method :attributes_for
  end
end
