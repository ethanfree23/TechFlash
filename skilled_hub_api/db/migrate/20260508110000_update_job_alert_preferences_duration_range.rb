class UpdateJobAlertPreferencesDurationRange < ActiveRecord::Migration[7.1]
  def change
    add_column :job_alert_preferences, :min_duration_weeks, :integer
    add_column :job_alert_preferences, :max_duration_weeks, :integer
    remove_column :job_alert_preferences, :max_duration_days, :integer
  end
end
