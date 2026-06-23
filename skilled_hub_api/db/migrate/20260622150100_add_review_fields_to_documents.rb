class AddReviewFieldsToDocuments < ActiveRecord::Migration[7.1]
  def change
    change_table :documents, bulk: true do |t|
      t.integer :status, null: false, default: 0
      t.references :reviewed_by_user, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.text :rejection_reason
      t.datetime :expires_at
      t.string :issuer
      t.string :document_number
      t.date :issued_on
      t.date :valid_until
      t.json :metadata, default: {}
    end

    add_index :documents, :status
    add_index :documents, :valid_until
  end
end
