# frozen_string_literal: true

module Schedule
  # Decides whether a technician is genuinely double-booked by a job.
  #
  # Replaces the naive `start_a < end_b && end_a > start_b` date-range test: two jobs only
  # conflict when their actual working periods overlap. A Mon-Fri job and a Sat-Sun job can
  # share a date range without conflicting.
  class ConflictDetector
    # Single home for any future travel/turnaround allowance between two assignments.
    # Zero today, matching current TechFlash rules.
    TRAVEL_BUFFER_MINUTES = 0

    Commitment = Struct.new(:job, :intervals, keyword_init: true)

    Result = Struct.new(
      :conflict,
      :indeterminate,
      :conflicting_job_ids,
      :conflicting_dates,
      :available_dates,
      :requested_dates,
      :committed_through_at,
      :commitments,
      keyword_init: true
    ) do
      def conflict?
        !!conflict
      end

      # True when a commitment has no usable schedule, so no alternate schedule can be
      # computed safely and the job must be treated as unavailable rather than negotiable.
      def indeterminate?
        !!indeterminate
      end
    end

    class << self
      # `working_dates` / `start_at` + `end_at` let callers test a *prospective* schedule
      # (an alternate-schedule proposal) without mutating the job first.
      #
      # `commitments` lets list views load a technician's assignments once and reuse them.
      def call(technician_profile:, job:, start_at: nil, end_at: nil, working_dates: nil, commitments: nil)
        new(
          technician_profile: technician_profile,
          job: job,
          start_at: start_at,
          end_at: end_at,
          working_dates: working_dates,
          commitments: commitments
        ).call
      end

      # Every assignment that constrains this technician, expanded into working intervals.
      # Memoized per technician_profile instance so serializing a page of jobs stays cheap.
      def commitments_for(technician_profile)
        return [] if technician_profile.blank?

        cached = technician_profile.instance_variable_get(:@techflash_schedule_commitments)
        return cached if cached

        commitments = load_commitments(technician_profile)
        technician_profile.instance_variable_set(:@techflash_schedule_commitments, commitments)
        commitments
      end

      # Call after a technician's assignments change within the same unit of work.
      def reset_commitments_cache!(technician_profile)
        technician_profile&.remove_instance_variable(:@techflash_schedule_commitments) if
          technician_profile&.instance_variable_defined?(:@techflash_schedule_commitments)
        nil
      end

      def load_commitments(technician_profile)
        Job.joins(:job_applications)
           .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
           .where(status: JobEffectiveStatus::CLAIMED_STATUSES)
           .distinct
           .map do |committed_job|
             intervals =
               if committed_job.scheduled_start_at.blank? || committed_job.scheduled_end_at.blank?
                 # Unknown schedule: we cannot prove the technician is free.
                 nil
               else
                 WorkingIntervalExpander.for_committed_job(committed_job, technician_profile: technician_profile)
               end
             Commitment.new(job: committed_job, intervals: intervals)
           end
      end
    end

    def initialize(technician_profile:, job:, start_at: nil, end_at: nil, working_dates: nil, commitments: nil)
      @technician_profile = technician_profile
      @job = job
      @start_at = start_at
      @end_at = end_at
      @working_dates = working_dates
      @preloaded_commitments = commitments
    end

    def call
      requested = target_intervals
      commitments = relevant_commitments

      unresolved = commitments.select { |c| c.intervals.nil? }
      if unresolved.any?
        return Result.new(
          conflict: true,
          indeterminate: true,
          conflicting_job_ids: unresolved.map { |c| c.job.id },
          conflicting_dates: [],
          available_dates: [],
          requested_dates: requested.map(&:date),
          committed_through_at: nil,
          commitments: commitments
        )
      end

      return no_conflict_result(requested, commitments) if requested.empty? || commitments.empty?

      conflicting_dates = []
      conflicting_job_ids = []
      committed_through_at = nil

      requested.each do |interval|
        commitments.each do |commitment|
          commitment.intervals.each do |committed|
            next unless interval.overlaps?(committed, buffer_minutes: TRAVEL_BUFFER_MINUTES)

            conflicting_dates << interval.date
            conflicting_job_ids << commitment.job.id
            if committed_through_at.nil? || committed.ends_at > committed_through_at
              committed_through_at = committed.ends_at
            end
          end
        end
      end

      conflicting_dates = conflicting_dates.uniq.sort
      Result.new(
        conflict: conflicting_dates.any?,
        indeterminate: false,
        conflicting_job_ids: conflicting_job_ids.uniq,
        conflicting_dates: conflicting_dates,
        available_dates: requested.map(&:date) - conflicting_dates,
        requested_dates: requested.map(&:date),
        committed_through_at: committed_through_at,
        commitments: commitments
      )
    end

    private

    def no_conflict_result(requested, commitments)
      Result.new(
        conflict: false,
        indeterminate: false,
        conflicting_job_ids: [],
        conflicting_dates: [],
        available_dates: requested.map(&:date),
        requested_dates: requested.map(&:date),
        committed_through_at: nil,
        commitments: commitments
      )
    end

    def target_intervals
      return [] if @job.blank?
      return WorkingIntervalExpander.for_dates(@job, @working_dates) if @working_dates.present?
      return WorkingIntervalExpander.for_window(@job, @start_at, @end_at) if @start_at.present? && @end_at.present?

      WorkingIntervalExpander.for_job(@job)
    end

    # The technician's own commitment on the job under test must never count against them.
    def relevant_commitments
      all = @preloaded_commitments || self.class.commitments_for(@technician_profile)
      return all if @job.blank? || @job.id.blank?

      all.reject { |commitment| commitment.job.id == @job.id }
    end
  end
end
