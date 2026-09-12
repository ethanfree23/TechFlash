# frozen_string_literal: true

class AddInboundFingerprintToAiSmsTurns < ActiveRecord::Migration[7.1]
  def change
    add_column :ai_sms_turns, :inbound_fingerprint, :string
    add_column :ai_sms_turns, :received_at, :datetime
    add_index :ai_sms_turns, [:inbound_fingerprint, :received_at],
              name: "index_ai_sms_turns_on_fingerprint_and_received_at"
  end
end
