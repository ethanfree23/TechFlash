class AddGoLiveAndAccessControls < ActiveRecord::Migration[7.1]
  def change
    add_column :jobs, :go_live_at, :datetime
    add_column :membership_tier_configs, :job_access_min_experience_years, :integer
  end
end
