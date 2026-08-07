class BackfillCheckrTrackingDefaults < ActiveRecord::Migration[7.1]
  def up
    execute <<~SQL
      UPDATE background_checks
      SET provider_includes_canceled = 0
      WHERE provider_includes_canceled IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET attempt_count = 0
      WHERE attempt_count IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET hydrated = 0
      WHERE hydrated IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET duplicate = 0
      WHERE duplicate IS NULL
    SQL

    change_column_default :background_checks, :provider_includes_canceled, from: nil, to: false
    change_column_null :background_checks, :provider_includes_canceled, false
  end

  def down
    change_column_null :background_checks, :provider_includes_canceled, true
  end
end
