# frozen_string_literal: true

module Schedule
  class ExpectedCompletionCalculator
    LUNCH_HOURS = 1

    def self.call(start_at:, work_days_count:, hours_per_day:, scheduled_weekdays:, timezone:)
      return nil if start_at.blank?

      tz = timezone.to_s.presence || "UTC"
      local_start = start_at.in_time_zone(tz)
      days_needed = [work_days_count.to_i, 1].max
      day_set = Array(scheduled_weekdays).map(&:to_i).uniq
      day_set = [1, 2, 3, 4, 5] if day_set.empty?

      target_date = local_start.to_date
      worked_days = 0
      while worked_days < days_needed
        cwday = target_date.cwday
        worked_days += 1 if day_set.include?(cwday)
        break if worked_days >= days_needed

        target_date += 1.day
      end

      end_day_start = Time.find_zone!(tz).local(
        target_date.year,
        target_date.month,
        target_date.day,
        local_start.hour,
        local_start.min,
        0
      )
      end_day_start + ([hours_per_day.to_i, 1].max + LUNCH_HOURS).hours
    rescue ArgumentError
      nil
    end
  end
end
