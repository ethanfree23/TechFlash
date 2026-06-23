class CreateReviewFlags < ActiveRecord::Migration[7.1]
  def change
    create_table :review_flags do |t|
      t.references :rating, null: false, foreign_key: true
      t.string :reason, null: false
      t.integer :risk_score, null: false, default: 0
      t.json :details, null: false, default: {}
      t.integer :status, null: false, default: 0
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.text :review_notes

      t.timestamps
    end

    add_index :review_flags, :reason
    add_index :review_flags, :status
  end
end
