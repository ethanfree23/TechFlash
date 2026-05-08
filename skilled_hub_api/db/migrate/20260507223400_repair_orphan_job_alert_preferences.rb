# frozen_string_literal: true

# Runs before 20260507223500. If a previous migrate failed after creating
# `job_alert_preferences` but before sibling tables, drop the orphan so the
# notification migration can run (SQLite: duplicate index name on retry).
class RepairOrphanJobAlertPreferences < ActiveRecord::Migration[7.1]
  def up
    return unless table_exists?(:job_alert_preferences)
    return if table_exists?(:app_notifications)

    drop_table :job_alert_preferences
  end

  def down; end
end
