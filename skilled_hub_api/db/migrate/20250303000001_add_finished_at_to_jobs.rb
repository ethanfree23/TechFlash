class AddFinishedAtToJobs < ActiveRecord::Migration[7.1]
  def up
    add_column :jobs, :finished_at, :datetime
    reversible do |dir|
      dir.up do
        execute "UPDATE jobs SET finished_at = updated_at WHERE status = 5"
      end
    end
  end

  def down
    remove_column :jobs, :finished_at
  end
end
