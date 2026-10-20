# frozen_string_literal: true

# Company-wide insurance covers technicians; insurance is no longer a per-job
# verification requirement.
class RemoveRequireInsuranceVerificationFromJobs < ActiveRecord::Migration[7.1]
  def up
    if column_exists?(:jobs, :require_insurance_verification)
      remove_column :jobs, :require_insurance_verification
    end

    say_with_time "Strip require_insurance_verification from job template configurations" do
      JobTemplate.reset_column_information if defined?(JobTemplate)
      JobTemplate.find_each do |template|
        config = template.configuration_hash
        next unless config.key?("require_insurance_verification") || config.key?(:require_insurance_verification)

        cleaned = config.except("require_insurance_verification", :require_insurance_verification)
        template.update_columns(configuration: cleaned, updated_at: Time.current)
      end
    end
  end

  def down
    unless column_exists?(:jobs, :require_insurance_verification)
      add_column :jobs, :require_insurance_verification, :boolean, null: false, default: false
    end
  end
end
