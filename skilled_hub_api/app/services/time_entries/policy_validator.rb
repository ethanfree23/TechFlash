# frozen_string_literal: true

module TimeEntries
  class PolicyValidator
    Result = Struct.new(:ok?, :error, :weekend_multiplier, :overtime_multiplier, keyword_init: true)

    def self.call(job:, time_entry:, actor_user:)
      new(job: job, time_entry: time_entry, actor_user: actor_user).call
    end

    def initialize(job:, time_entry:, actor_user:)
      @job = job
      @time_entry = time_entry
      @actor_user = actor_user
    end

    def call
      worked_at = @time_entry.worked_start_at.in_time_zone(job_tz)
      day = worked_at.wday.zero? ? 7 : worked_at.wday
      weekend_day = day == 6 || day == 7

      if weekend_day
        weekend_result = validate_weekend_access(day)
        return weekend_result unless weekend_result.ok?
      elsif !@job.standard_work_days.include?(day)
        return Result.new(ok?: false, error: "Hours can only be submitted on scheduled workdays.")
      end

      overtime_mult = overtime_multiplier_for_entry
      weekend_mult = weekend_multiplier_for_day(day)
      Result.new(ok?: true, weekend_multiplier: weekend_mult, overtime_multiplier: overtime_mult)
    end

    private

    def job_tz
      @job.job_timezone.presence || "UTC"
    end

    def validate_weekend_access(day)
      if @job.prohibited?
        return Result.new(ok?: false, error: "Weekend hours are not allowed for this job.")
      end

      policy = day == 6 ? @job.saturday_work_policy : @job.sunday_work_policy
      if policy == "unavailable"
        return Result.new(ok?: false, error: "Weekend hours are not allowed for the selected day.")
      end

      if @job.optional?
        request = @time_entry.weekend_work_request
        unless request&.accepted_by_technician?
          return Result.new(ok?: false, error: "Weekend hours require an accepted weekend request.")
        end
      end

      Result.new(ok?: true)
    end

    def weekend_multiplier_for_day(day)
      case day
      when 6
        @job.saturday_premium_rate? ? @job.saturday_multiplier.to_d : nil
      when 7
        @job.sunday_premium_rate? ? @job.sunday_multiplier.to_d : nil
      else
        nil
      end
    end

    def overtime_multiplier_for_entry
      return nil unless @job.overtime_enabled?

      hours = @time_entry.worked_hours.to_d
      over_daily = @job.daily_overtime_threshold_hours.present? && hours > @job.daily_overtime_threshold_hours.to_d
      return @job.overtime_multiplier.to_d if over_daily

      nil
    end
  end
end
