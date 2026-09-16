# frozen_string_literal: true

module Schedule
  # Turns a job's schedule into the concrete periods the technician is actually occupied.
  #
  # A job spanning Sep 1-14 Mon-Fri does not occupy Sep 6-7; expanding to intervals is what
  # lets two overlapping date ranges be recognised as non-conflicting.
  class WorkingIntervalExpander
    # Guards against a corrupt schedule turning expansion into an unbounded walk.
    MAX_SPAN_DAYS = 400

    Interval = Struct.new(:date, :starts_at, :ends_at, :source, :job_id, keyword_init: true) do
      def overlaps?(other, buffer_minutes: 0)
        buffer = buffer_minutes.to_i.minutes
        starts_at < (other.ends_at + buffer) && other.starts_at < (ends_at + buffer)
      end
    end

    class << self
      # Intervals for the job's own persisted schedule.
      def for_job(job)
        return [] if job.scheduled_start_at.blank? || job.scheduled_end_at.blank?

        for_dates(job, working_dates_between(job, job.scheduled_start_at, job.scheduled_end_at))
      end

      # Intervals for a prospective window (an alternate-schedule proposal), using the
      # job's own working weekdays and shift times.
      def for_window(job, start_at, end_at)
        return [] if start_at.blank? || end_at.blank?

        for_dates(job, working_dates_between(job, start_at, end_at))
      end

      def for_dates(job, dates)
        zone = Schedule.zone_for(job)
        Array(dates).compact.map { |d| coerce_date(d) }.compact.uniq.sort.map do |date|
          window = ShiftWindow.for(job: job, cwday: date.cwday)
          midnight = zone.local(date.year, date.month, date.day, 0, 0, 0)
          Interval.new(
            date: date,
            starts_at: midnight + window.start_minute.minutes,
            ends_at: midnight + window.end_minute.minutes,
            source: :scheduled,
            job_id: job.id
          )
        end
      end

      # Working dates (in the job's own timezone) between two timestamps, inclusive.
      def working_dates_between(job, start_at, end_at)
        first = Schedule.local_date(start_at, job)
        last = Schedule.local_date(end_at, job)
        return [] if first.blank? || last.blank? || last < first

        last = first + MAX_SPAN_DAYS.days if (last - first).to_i > MAX_SPAN_DAYS
        (first..last).select { |date| job.working_weekday?(date.cwday) }
      end

      # The next `count` working dates for this job starting on or after `from_date`.
      def next_working_dates(job, from_date, count)
        needed = count.to_i
        return [] if needed <= 0 || from_date.blank?

        dates = []
        date = coerce_date(from_date)
        return [] if date.blank?

        scanned = 0
        while dates.length < needed && scanned <= MAX_SPAN_DAYS
          dates << date if job.working_weekday?(date.cwday)
          date += 1.day
          scanned += 1
        end
        dates
      end

      def first_working_date_on_or_after(job, from_date)
        date = coerce_date(from_date)
        return nil if date.blank?

        MAX_SPAN_DAYS.times do
          return date if job.working_weekday?(date.cwday)

          date += 1.day
        end
        nil
      end

      # Committed intervals for a technician's already-claimed job, including weekend days
      # the technician explicitly accepted (which are not part of standard_work_days).
      def for_committed_job(job, technician_profile:)
        intervals = for_job(job)
        intervals + accepted_weekend_intervals(job, technician_profile)
      end

      def coerce_date(value)
        case value
        when Date then value
        when Time, DateTime, ActiveSupport::TimeWithZone then value.to_date
        when String then (Date.parse(value) rescue nil)
        else value.respond_to?(:to_date) ? (value.to_date rescue nil) : nil
        end
      end

      private

      def accepted_weekend_intervals(job, technician_profile)
        return [] if technician_profile.blank?

        job.weekend_work_requests
           .where(technician_profile_id: technician_profile.id, status: :accepted_by_technician)
           .filter_map do |request|
             next if request.requested_start_at.blank? || request.requested_end_at.blank?

             Interval.new(
               date: Schedule.local_date(request.requested_start_at, job),
               starts_at: request.requested_start_at,
               ends_at: request.requested_end_at,
               source: :accepted_weekend_request,
               job_id: job.id
             )
           end
      end
    end
  end
end
