class CreateFeedbackSubmissions < ActiveRecord::Migration[7.1]
  def change
    create_table :feedback_submissions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :kind, null: false
      t.text :body, null: false
      t.string :page_path

      t.timestamps
    end
  end
end
