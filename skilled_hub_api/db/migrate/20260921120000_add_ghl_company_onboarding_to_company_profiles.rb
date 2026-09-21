# frozen_string_literal: true

# Company-side GHL/Meta onboarding context.
#
# business_zip_code is the company's own business ZIP from the acquisition funnel. It is
# deliberately NOT named zip_code: jobs have their own zip_code/address/city/state, and each
# job collects its location through the normal job-posting flow. Nothing may copy this value
# into a job's location.
#
# staffing_intent / hiring_context capture what the company told the funnel it needs. They are
# context only: they never create jobs and never set jobs.potential_full_time on their own.
class AddGhlCompanyOnboardingToCompanyProfiles < ActiveRecord::Migration[7.1]
  def change
    unless column_exists?(:company_profiles, :business_zip_code)
      add_column :company_profiles, :business_zip_code, :string
    end
    unless column_exists?(:company_profiles, :staffing_intent)
      add_column :company_profiles, :staffing_intent, :string
    end
    unless column_exists?(:company_profiles, :hiring_context)
      add_column :company_profiles, :hiring_context, :json, default: {}, null: false
    end
    unless column_exists?(:company_profiles, :acquisition_attribution)
      add_column :company_profiles, :acquisition_attribution, :json, default: {}, null: false
    end

    add_index :company_profiles, :staffing_intent unless index_exists?(:company_profiles, :staffing_intent)
  end
end
