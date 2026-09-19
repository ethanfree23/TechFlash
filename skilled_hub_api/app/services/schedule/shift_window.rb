# frozen_string_literal: true

module Schedule
  # Resolves the daily working window for a job on a given ISO weekday (1=Mon .. 7=Sun).
  #
  # Single source of truth for "what hours does this job actually occupy on this day".
  # Falls back to the same shape Schedule::ExpectedCompletionCalculator assumes
  # (scheduled start time-of-day plus hours_per_day plus an unpaid lunch hour) so a job
  # without explicit per-day shifts produces identical windows either way.
  class ShiftWindow
    LUNCH_HOURS = ExpectedCompletionCalculator::LUNCH_HOURS
    DEFAULT_START_MINUTE = 8 * 60
    MINUTES_PER_DAY = 24 * 60

    Window = Struct.new(:start_minute, :end_minute, keyword_init: true) do
      def duration_minutes
        end_minute - start_minute
      end
    end

    WEEKEND_CWDAYS = [6, 7].freeze

    def self.for(job:, cwday:)
      configured(job, cwday) || default_for(job)
    end

    def self.configured(job, cwday)
      key = cwday.to_i.to_s
      raw =
        if WEEKEND_CWDAYS.include?(cwday.to_i)
          (job.weekend_day_shifts || {})[key] || (job.standard_day_shifts || {})[key]
        else
          (job.standard_day_shifts || {})[key]
        end
      return nil unless raw.is_a?(Hash)

      start_minute = parse_minute(raw["start_time"] || raw[:start_time])
      end_minute = parse_minute(raw["end_time"] || raw[:end_time])
      return nil if start_minute.nil? || end_minute.nil?

      # A shift that ends at or before it starts runs past midnight into the next day.
      end_minute += MINUTES_PER_DAY if end_minute <= start_minute
      Window.new(start_minute: start_minute, end_minute: end_minute)
    end

    def self.default_for(job)
      start_minute = default_start_minute(job)
      Window.new(start_minute: start_minute, end_minute: start_minute + default_duration_minutes(job))
    end

    def self.default_start_minute(job)
      anchor = job.scheduled_start_at
      return DEFAULT_START_MINUTE if anchor.blank?

      local = anchor.in_time_zone(Schedule.timezone_for(job))
      (local.hour * 60) + local.min
    end

    def self.default_duration_minutes(job)
      ([job.hours_per_day.to_i, 1].max + LUNCH_HOURS) * 60
    end

    def self.parse_minute(raw)
      value = raw.to_s
      return nil unless value.match?(/\A\d{1,2}:\d{2}\z/)

      hours, minutes = value.split(":").map(&:to_i)
      return nil unless hours.between?(0, 24) && minutes.between?(0, 59)

      (hours * 60) + minutes
    end

    private_class_method :configured, :default_for, :default_start_minute, :default_duration_minutes, :parse_minute
  end
end
