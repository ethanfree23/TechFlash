class AddFeedbackConversations < ActiveRecord::Migration[7.1]
  def change
    add_column :conversations, :conversation_type, :string, null: false, default: "job"
    add_reference :conversations, :feedback_submission, foreign_key: true, index: { unique: true }

    change_column_null :conversations, :job_id, true
    change_column_null :conversations, :technician_profile_id, true
    change_column_null :conversations, :company_profile_id, true

    add_index :conversations, :conversation_type
  end
end
