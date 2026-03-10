class AddScheduledTimesToJobs < ActiveRecord::Migration[7.0]
  def change
    add_column :jobs, :scheduled_start_at, :datetime
    add_column :jobs, :scheduled_end_at, :datetime
  end
end
