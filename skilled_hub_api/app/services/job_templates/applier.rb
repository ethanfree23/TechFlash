# frozen_string_literal: true

module JobTemplates
  # Turns a template plus a company-chosen start date into job attributes.
  #
  # The template carries the duration and working-schedule structure; the company always
  # picks the new calendar start, and TechFlash derives the end date from the job's own
  # working-day logic rather than copying the original dates.
  class Applier
    Result = Struct.new(:attributes, :start_at, :end_at, :working_dates, keyword_init: true)

    def self.call(template:, start_date: nil)
      attributes = template.configuration_hash.slice(*JobTemplate::REUSABLE_FIELDS)
      probe = Job.new(attributes.merge("company_profile_id" => template.company_profile_id))

      start_at = resolved_start_at(template, probe, start_date)
      if start_at.present?
        probe.scheduled_start_at = start_at
        end_at = Schedule::ExpectedCompletionCalculator.call(
          start_at: start_at,
          work_days_count: template.duration_days,
          hours_per_day: probe.hours_per_day,
          scheduled_weekdays: probe.standard_work_days,
          timezone: Schedule.timezone_for(probe)
        )
        attributes = attributes.merge(
          "scheduled_start_at" => start_at,
          "scheduled_end_at" => end_at
        )
      end

      working_dates =
        if start_at.present? && attributes["scheduled_end_at"].present?
          probe.scheduled_end_at = attributes["scheduled_end_at"]
          Schedule::WorkingIntervalExpander
            .working_dates_between(probe, start_at, attributes["scheduled_end_at"])
            .map(&:to_s)
        else
          []
        end

      Result.new(
        attributes: attributes,
        start_at: start_at,
        end_at: attributes["scheduled_end_at"],
        working_dates: working_dates
      )
    end

    def self.resolved_start_at(template, probe, start_date)
      date = Schedule::WorkingIntervalExpander.coerce_date(start_date)
      return nil if date.blank?

      # A start date that is not a working day for this template rolls forward to the next one.
      date = Schedule::WorkingIntervalExpander.first_working_date_on_or_after(probe, date) || date
      hours, minutes = template.schedule_start_time.split(":").map(&:to_i)
      Schedule.zone_for(probe).local(date.year, date.month, date.day, hours.to_i, minutes.to_i, 0)
    end
    private_class_method :resolved_start_at
  end
end
