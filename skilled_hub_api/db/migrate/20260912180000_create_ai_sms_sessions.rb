# frozen_string_literal: true

class CreateAiSmsSessions < ActiveRecord::Migration[7.1]
  def change
    create_table :ai_sms_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :ghl_contact_id
      t.string :ghl_conversation_id
      t.string :purpose, null: false, default: "technician_verification"
      t.string :status, null: false, default: "active"
      t.datetime :started_at, null: false
      t.datetime :last_inbound_at
      t.datetime :last_outbound_at
      t.datetime :completed_at
      t.datetime :paused_at
      t.text :failure_reason
      t.json :metadata, default: {}, null: false
      t.timestamps
    end

    add_index :ai_sms_sessions, [:user_id, :purpose]
    add_index :ai_sms_sessions, :status
    add_index :ai_sms_sessions, :ghl_contact_id
    add_index :ai_sms_sessions, [:user_id, :purpose],
              unique: true,
              where: "status IN ('active', 'waiting_for_reply')",
              name: "idx_ai_sms_sessions_one_live_per_user_purpose"

    create_table :ai_sms_turns do |t|
      t.references :ai_sms_session, null: false, foreign_key: true
      t.string :direction, null: false
      t.string :ghl_message_id
      t.text :body
      t.json :attachments, default: [], null: false
      t.json :inventory_before
      t.json :inventory_after
      t.json :actions_proposed, default: [], null: false
      t.json :actions_accepted, default: [], null: false
      t.json :actions_rejected, default: [], null: false
      t.text :error
      t.json :metadata, default: {}, null: false
      t.timestamps
    end

    add_index :ai_sms_turns, :ghl_message_id, unique: true, where: "ghl_message_id IS NOT NULL"
    add_index :ai_sms_turns, [:ai_sms_session_id, :created_at]
  end
end
