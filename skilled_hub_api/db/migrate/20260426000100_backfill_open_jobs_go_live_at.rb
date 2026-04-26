class BackfillOpenJobsGoLiveAt < ActiveRecord::Migration[7.1]
  def up
    execute <<~SQL.squish
      UPDATE jobs
      SET go_live_at = CURRENT_TIMESTAMP
      WHERE status = 0
        AND go_live_at IS NOT NULL
        AND go_live_at > CURRENT_TIMESTAMP
    SQL
  end

  def down
    # Irreversible data backfill.
  end
end
