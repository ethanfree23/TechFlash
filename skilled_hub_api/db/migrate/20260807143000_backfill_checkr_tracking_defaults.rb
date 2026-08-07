class BackfillCheckrTrackingDefaults < ActiveRecord::Migration[7.1]
  def up
    false_literal = connection.quoted_false

    execute <<~SQL
      UPDATE background_checks
      SET provider_includes_canceled = #{false_literal}
      WHERE provider_includes_canceled IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET attempt_count = 0
      WHERE attempt_count IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET hydrated = #{false_literal}
      WHERE hydrated IS NULL
    SQL
    execute <<~SQL
      UPDATE checkr_webhook_events
      SET duplicate = #{false_literal}
      WHERE duplicate IS NULL
    SQL

    change_column_default :background_checks, :provider_includes_canceled, from: nil, to: false
    change_column_null :background_checks, :provider_includes_canceled, false
  end

  def down
    change_column_null :background_checks, :provider_includes_canceled, true
  end
end
