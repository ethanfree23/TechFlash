# frozen_string_literal: true

class BackfillNullJobStatuses < ActiveRecord::Migration[7.1]
  def up
    return unless table_exists?(:jobs)

    execute <<-SQL.squish
      UPDATE jobs SET status = 0 WHERE status IS NULL
    SQL
  end

  def down
    # Data repair; no safe down migration.
  end
end
