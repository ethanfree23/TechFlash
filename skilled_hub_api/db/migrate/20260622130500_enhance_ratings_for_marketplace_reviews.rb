class EnhanceRatingsForMarketplaceReviews < ActiveRecord::Migration[7.1]
  def change
    change_table :ratings, bulk: true do |t|
      t.boolean :would_hire_again
      t.boolean :would_recommend
      t.integer :on_time_status
      t.boolean :request_again
      t.boolean :would_work_again
      t.boolean :payment_on_time
      t.integer :job_description_match
      t.datetime :review_window_expires_at
      t.datetime :visible_at
      t.integer :moderation_status, null: false, default: 0
      t.datetime :hidden_at
      t.references :hidden_by_user, foreign_key: { to_table: :users }
      t.text :moderation_notes
      t.decimal :review_quality_weight, precision: 4, scale: 2, null: false, default: 1.0
    end

    add_index :ratings, :visible_at
    add_index :ratings, :moderation_status
    add_index :ratings, [:job_id, :reviewer_type], name: "index_ratings_on_job_and_reviewer_type"
  end
end
