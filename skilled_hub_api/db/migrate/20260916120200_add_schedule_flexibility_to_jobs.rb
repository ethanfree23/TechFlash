# frozen_string_literal: true

class AddScheduleFlexibilityToJobs < ActiveRecord::Migration[7.1]
  FLEXIBLE_START = 0
  HARD_END = 1

  def up
    unless column_exists?(:jobs, :schedule_flexibility)
      add_column :jobs, :schedule_flexibility, :integer, default: FLEXIBLE_START, null: false
    end
    add_index :jobs, :schedule_flexibility unless index_exists?(:jobs, :schedule_flexibility)

    # Existing jobs already express "this must finish by a date" through hard_deadline_at.
    # Derive the new setting from it instead of asking companies to re-state it.
    execute <<~SQL.squish
      UPDATE jobs SET schedule_flexibility = #{HARD_END} WHERE hard_deadline_at IS NOT NULL
    SQL
  end

  def down
    remove_index :jobs, :schedule_flexibility
    remove_column :jobs, :schedule_flexibility
  end
end
