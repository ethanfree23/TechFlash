class CreateVerificationProfiles < ActiveRecord::Migration[7.1]
  def change
    create_table :verification_profiles do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.boolean :email_verified, null: false, default: false
      t.boolean :phone_verified, null: false, default: false
      t.integer :identity_status, null: false, default: 0
      t.integer :background_status, null: false, default: 0
      t.integer :references_status, null: false, default: 0
      t.integer :licenses_status, null: false, default: 0
      t.integer :insurance_status, null: false, default: 0
      t.datetime :last_verified_at
      t.integer :overall_completion_percentage, null: false, default: 0

      t.timestamps
    end
  end
end
