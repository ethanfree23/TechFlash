class AddVerificationRequirementsToJobs < ActiveRecord::Migration[7.1]
  def change
    change_table :jobs, bulk: true do |t|
      t.boolean :require_background_check, null: false, default: false
      t.boolean :require_identity_verification, null: false, default: false
      t.integer :minimum_verified_references, null: false, default: 0
      t.boolean :require_insurance_verification, null: false, default: false
    end
  end
end
