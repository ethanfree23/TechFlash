# frozen_string_literal: true

module Schedule
  # Digest of the job terms an alternate-schedule proposal was calculated against.
  #
  # If the company edits the job's schedule or pay after a technician proposes, the
  # recorded dates and the resulting charge would be based on stale data. Comparing
  # signatures lets us invalidate and recalculate instead of silently accepting.
  class ProposalSignature
    MATERIAL_FIELDS = %w[
      scheduled_start_at
      scheduled_end_at
      days
      hours_per_day
      hourly_rate_cents
      pay_basis
      standard_work_days
      standard_day_shifts
      weekend_day_shifts
      weekend_work_policy
      saturday_work_policy
      sunday_work_policy
      job_timezone
      schedule_flexibility
      hard_deadline_at
      start_mode
    ].freeze

    def self.for(job)
      return nil if job.blank?

      Digest::SHA256.hexdigest(payload(job).to_json)[0, 32]
    end

    def self.payload(job)
      MATERIAL_FIELDS.index_with { |field| normalize(job.public_send(field)) }
    end

    def self.normalize(value)
      case value
      when Time, DateTime, ActiveSupport::TimeWithZone then value.utc.iso8601
      when Date then value.iso8601
      when Hash then value.sort.to_h.transform_values { |v| normalize(v) }
      when Array then value.map { |v| normalize(v) }
      when BigDecimal then value.to_s("F")
      else value
      end
    end

    private_class_method :normalize
  end
end
