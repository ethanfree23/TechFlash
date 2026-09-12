# frozen_string_literal: true

class AddGhlFieldsToSmsDeliveryLogs < ActiveRecord::Migration[7.1]
  def change
    change_table :sms_delivery_logs, bulk: true do |t|
      t.string :provider
      t.string :provider_message_id
      t.string :provider_conversation_id
    end

    add_index :sms_delivery_logs, :provider
    add_index :sms_delivery_logs, :provider_message_id
  end
end
