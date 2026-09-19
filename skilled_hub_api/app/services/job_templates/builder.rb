# frozen_string_literal: true

module JobTemplates
  # Extracts the reusable configuration from a job (or from raw job params) so it can be
  # saved as a template.
  class Builder
    def self.from_job(job)
      config = JobTemplate::REUSABLE_FIELDS.index_with { |field| job.public_send(field) if job.respond_to?(field) }
      config = config.compact
      config.merge(schedule_meta_for(job))
    end

    # Companies can also save a template straight from the create-job form without
    # publishing, so accept an attribute hash on the same whitelist.
    def self.from_attributes(attributes)
      raw = (attributes || {}).to_h.stringify_keys
      config = raw.slice(*JobTemplate::REUSABLE_FIELDS).compact
      config.merge(raw.slice(*JobTemplate::SCHEDULE_META_KEYS).compact)
    end

    # Duration/time-of-day structure is preserved; the calendar dates are not.
    def self.schedule_meta_for(job)
      meta = {}
      if job.scheduled_start_at.present?
        local = job.scheduled_start_at.in_time_zone(Schedule.timezone_for(job))
        meta["schedule_start_time"] = format("%02d:%02d", local.hour, local.min)
      end
      if job.scheduled_start_at.present? && job.scheduled_end_at.present?
        meta["schedule_working_day_span"] = Schedule::WorkingIntervalExpander
                                            .working_dates_between(job, job.scheduled_start_at, job.scheduled_end_at)
                                            .length
      end
      meta
    end
    private_class_method :schedule_meta_for
  end
end
