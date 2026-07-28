# frozen_string_literal: true

module Jobs
  class TermChangeAuditLogger
    TRACKED_FIELDS = %w[
      weekend_work_policy
      standard_work_days
      saturday_work_policy
      sunday_work_policy
      saturday_multiplier
      sunday_multiplier
      overtime_enabled
      overtime_multiplier
      daily_overtime_threshold_hours
      weekly_overtime_threshold_hours
      premium_combination_rule
      scheduled_start_at
      scheduled_end_at
      hard_deadline_at
    ].freeze

    def self.log!(job:, actor_user:, reason: nil)
      changes = job.saved_changes.slice(*TRACKED_FIELDS)
      return if changes.blank?

      previous_values = {}
      new_values = {}
      changes.each do |key, pair|
        previous_values[key] = pair.first
        new_values[key] = pair.last
      end

      requires_ack = previous_values["weekend_work_policy"] == "optional" && new_values["weekend_work_policy"] == "required"
      JobTermChangeAudit.create!(
        job: job,
        actor_user: actor_user,
        change_type: "schedule_or_pay_terms_updated",
        reason: reason,
        previous_values: previous_values,
        new_values: new_values,
        requires_technician_acknowledgement: requires_ack
      )
    end
  end
end
