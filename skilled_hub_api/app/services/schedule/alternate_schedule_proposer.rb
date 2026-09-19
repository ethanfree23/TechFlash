# frozen_string_literal: true

module Schedule
  # Computes the alternate schedules a technician can legitimately offer when the job they
  # want overlaps something they are already committed to.
  #
  # TechFlash does the date arithmetic; the technician only picks an option.
  #
  #   start_after_conflict  "I can start Sep 15 and work the full requested duration."
  #                         Preserves the requested number of working days, shifted later.
  #   keep_original_end     "I can start Sep 15 and work through Sep 23."
  #                         Preserves the company's end date, offering only the days left.
  class AlternateScheduleProposer
    # How far forward we will look for a conflict-free start before giving up.
    MAX_START_SEARCH_STEPS = 120

    Option = Struct.new(
      :kind,
      :start_at,
      :end_at,
      :working_dates,
      :unavailable_dates,
      :days,
      :requested_days,
      :full_duration,
      :partial,
      keyword_init: true
    ) do
      def as_json(*)
        {
          kind: kind.to_s,
          start_at: start_at,
          end_at: end_at,
          working_dates: Array(working_dates).map(&:to_s),
          unavailable_dates: Array(unavailable_dates).map(&:to_s),
          days: days,
          requested_days: requested_days,
          full_duration: full_duration,
          partial: partial
        }
      end
    end

    def self.call(technician_profile:, job:, conflict: nil, commitments: nil)
      new(technician_profile: technician_profile, job: job, conflict: conflict, commitments: commitments).call
    end

    def initialize(technician_profile:, job:, conflict: nil, commitments: nil)
      @technician_profile = technician_profile
      @job = job
      @commitments = commitments || ConflictDetector.commitments_for(technician_profile)
      @conflict = conflict || ConflictDetector.call(
        technician_profile: technician_profile,
        job: job,
        commitments: @commitments
      )
    end

    attr_reader :conflict

    # Ordered list of offerable options. Empty means there is no valid way for this
    # technician to perform the work under the job's constraints.
    def call
      return [] unless conflict.conflict?
      return [] if conflict.indeterminate?

      if @job.schedule_hard_end?
        [full_duration_option_within_hard_end, partial_duration_option].compact
      else
        full = full_duration_option
        # Flexible-start jobs want the whole assignment. Only fall back to a partial
        # proposal when no later start can fit the full duration at all.
        full ? [full] : [partial_duration_option].compact
      end
    end

    def requested_days
      @requested_days ||= begin
        declared = @job.days.to_i
        declared.positive? ? declared : [conflict.requested_dates.length, 1].max
      end
    end

    private

    # OPTION A — shift the start past the existing commitment, keep the full duration.
    def full_duration_option
      @full_duration_option_computed ||= begin
        @full_duration_option = compute_full_duration_option
        true
      end
      @full_duration_option
    end

    def compute_full_duration_option
      candidate = earliest_free_start_date
      return nil if candidate.blank?

      MAX_START_SEARCH_STEPS.times do
        dates = WorkingIntervalExpander.next_working_dates(@job, candidate, requested_days)
        return nil if dates.length < requested_days

        intervals = WorkingIntervalExpander.for_dates(@job, dates)
        return nil if intervals.empty?

        recheck = ConflictDetector.call(
          technician_profile: @technician_profile,
          job: @job,
          working_dates: dates,
          commitments: @commitments
        )
        unless recheck.conflict?
          return Option.new(
            kind: :start_after_conflict,
            start_at: intervals.first.starts_at,
            end_at: intervals.last.ends_at,
            working_dates: dates,
            unavailable_dates: conflict.conflicting_dates,
            days: dates.length,
            requested_days: requested_days,
            full_duration: true,
            partial: false
          )
        end

        # Jump past whatever blocked us rather than crawling one day at a time.
        blocked_through = recheck.conflicting_dates.max || candidate
        candidate = WorkingIntervalExpander.first_working_date_on_or_after(@job, blocked_through + 1.day)
        return nil if candidate.blank?
      end

      nil
    end

    # A hard-end job can still take the full duration if the shifted window finishes in time.
    def full_duration_option_within_hard_end
      option = full_duration_option
      return nil if option.blank?

      boundary = @job.hard_end_boundary_at
      return option if boundary.blank?
      return nil if option.end_at > boundary

      option
    end

    # OPTION B — keep the company's end date, offer only the days still available.
    #
    # An assignment is one contiguous window, so this offers the requested working days
    # that fall after the last conflicting day. Requested days that are not being offered
    # are reported explicitly rather than quietly dropped.
    def partial_duration_option
      last_conflicting_date = conflict.conflicting_dates.max
      return nil if last_conflicting_date.blank?

      dates = conflict.requested_dates.select { |date| date > last_conflicting_date }
      boundary = @job.hard_end_boundary_at
      intervals = WorkingIntervalExpander.for_dates(@job, dates)
      intervals = intervals.reject { |i| i.ends_at > boundary } if boundary.present?
      return nil if intervals.empty?

      offered_dates = intervals.map(&:date)
      # Offering every requested day is not an alternate schedule; it would mean no conflict.
      return nil if offered_dates.length >= conflict.requested_dates.length

      Option.new(
        kind: :keep_original_end,
        start_at: intervals.first.starts_at,
        end_at: intervals.last.ends_at,
        working_dates: offered_dates,
        unavailable_dates: conflict.requested_dates - offered_dates,
        days: offered_dates.length,
        requested_days: requested_days,
        full_duration: false,
        partial: true
      )
    end

    # First working date whose shift begins after every conflicting commitment has ended.
    def earliest_free_start_date
      committed_through = conflict.committed_through_at
      return WorkingIntervalExpander.first_working_date_on_or_after(@job, Date.current) if committed_through.blank?

      date = WorkingIntervalExpander.first_working_date_on_or_after(
        @job,
        Schedule.local_date(committed_through, @job)
      )
      return nil if date.blank?

      # The commitment may end mid-shift on that date; if so the technician starts the next
      # working day, which is the "conflict ends exactly before new job begins" case.
      interval = WorkingIntervalExpander.for_dates(@job, [date]).first
      return date if interval && interval.starts_at >= committed_through

      WorkingIntervalExpander.first_working_date_on_or_after(@job, date + 1.day)
    end
  end
end
