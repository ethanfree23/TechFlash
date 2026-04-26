class AddAdditionalJobAccessRulesToMembershipTierConfigs < ActiveRecord::Migration[7.1]
  def change
    change_table :membership_tier_configs, bulk: true do |t|
      t.integer :job_access_min_jobs_completed
      t.integer :job_access_min_successful_jobs
      t.integer :job_access_min_profile_completeness_percent
      t.boolean :job_access_requires_verified_background, default: false, null: false
    end
  end
end
