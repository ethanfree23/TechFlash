class CreateVerificationReferences < ActiveRecord::Migration[7.1]
  def change
    create_table :verification_references do |t|
      t.references :technician_user, null: false, foreign_key: { to_table: :users }
      t.string :full_name, null: false
      t.string :email, null: false
      t.string :phone
      t.string :company_name
      t.string :relationship, null: false
      t.integer :status, null: false, default: 0
      t.string :request_token, null: false
      t.datetime :requested_at
      t.datetime :responded_at
      t.references :reviewed_by_user, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.text :review_notes
      t.json :answers, default: {}

      t.timestamps
    end

    add_index :verification_references, :request_token, unique: true
    add_index :verification_references, :status
  end
end
