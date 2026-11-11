# frozen_string_literal: true

class AddPostedUnderFundingWaiverToJobs < ActiveRecord::Migration[7.1]
  def change
    add_column :jobs, :posted_under_funding_waiver, :boolean, default: false, null: false
  end
end
