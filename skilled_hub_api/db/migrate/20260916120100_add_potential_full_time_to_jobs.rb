# frozen_string_literal: true

class AddPotentialFullTimeToJobs < ActiveRecord::Migration[7.1]
  def change
    # Designation only. `potential_full_time_details` is the forward-compatible home for a
    # later permanent-placement/conversion workflow (role title, salary band, conversion state)
    # so that workflow can be added without reshaping this designation.
    unless column_exists?(:jobs, :potential_full_time)
      add_column :jobs, :potential_full_time, :boolean, default: false, null: false
    end
    unless column_exists?(:jobs, :potential_full_time_details)
      add_column :jobs, :potential_full_time_details, :json, default: {}, null: false
    end

    add_index :jobs, :potential_full_time unless index_exists?(:jobs, :potential_full_time)
  end
end
