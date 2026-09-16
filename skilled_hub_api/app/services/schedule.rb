# frozen_string_literal: true

# Namespace for TechFlash scheduling logic.
#
# Anything that needs to reason about *when a job is actually worked* belongs here rather
# than in a controller or component: working-day expansion (Schedule::WorkingIntervalExpander),
# double-booking detection (Schedule::ConflictDetector), alternate-schedule generation
# (Schedule::AlternateScheduleProposer) and end-date derivation
# (Schedule::ExpectedCompletionCalculator).
module Schedule
  DEFAULT_TIMEZONE = "UTC"

  def self.timezone_for(job)
    job&.job_timezone.presence || DEFAULT_TIMEZONE
  end

  def self.zone_for(job)
    Time.find_zone(timezone_for(job)) || Time.find_zone!(DEFAULT_TIMEZONE)
  end

  def self.local_date(time, job)
    return nil if time.blank?

    time.in_time_zone(zone_for(job)).to_date
  end
end
