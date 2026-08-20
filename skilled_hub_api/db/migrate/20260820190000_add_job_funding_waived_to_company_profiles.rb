# frozen_string_literal: true

class AddJobFundingWaivedToCompanyProfiles < ActiveRecord::Migration[7.1]
  def change
    add_column :company_profiles, :job_funding_waived, :boolean, default: false, null: false
  end
end
