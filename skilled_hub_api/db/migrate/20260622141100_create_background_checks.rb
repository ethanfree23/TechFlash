class CreateBackgroundChecks < ActiveRecord::Migration[7.1]
  def change
    create_table :background_checks do |t|
      t.references :user, null: false, foreign_key: true
      t.string :provider, null: false, default: "checkr"
      t.string :provider_candidate_id
      t.string :provider_invitation_id
      t.string :provider_report_id
      t.string :package_name
      t.integer :status, null: false, default: 0
      t.string :result
      t.integer :payment_status, null: false, default: 0
      t.string :paid_by, null: false, default: "technician"
      t.datetime :started_at
      t.datetime :completed_at
      t.datetime :expires_at
      t.integer :admin_override_status, null: false, default: 0
      t.text :admin_notes

      t.timestamps
    end

    add_index :background_checks, :provider_candidate_id
    add_index :background_checks, :provider_invitation_id
    add_index :background_checks, :provider_report_id
    add_index :background_checks, :status
    add_index :background_checks, :expires_at
  end
end
