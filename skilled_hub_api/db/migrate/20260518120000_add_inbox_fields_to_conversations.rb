# frozen_string_literal: true

class AddInboxFieldsToConversations < ActiveRecord::Migration[7.1]
  def change
    add_column :conversations, :inbox_status, :string, null: false, default: "open"
    add_column :conversations, :priority, :string, null: false, default: "normal"
    add_reference :conversations, :assigned_to, foreign_key: { to_table: :users }, null: true
    add_column :conversations, :admin_read_at, :datetime

    add_index :conversations, :inbox_status
    add_index :conversations, [:conversation_type, :admin_read_at], name: "index_conversations_on_type_and_admin_read_at"

    add_column :messages, :internal, :boolean, null: false, default: false
  end
end
