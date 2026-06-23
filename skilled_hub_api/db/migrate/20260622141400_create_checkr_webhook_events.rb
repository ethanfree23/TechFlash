class CreateCheckrWebhookEvents < ActiveRecord::Migration[7.1]
  def change
    create_table :checkr_webhook_events do |t|
      t.string :checkr_event_id, null: false
      t.string :event_type
      t.text :payload
      t.datetime :processed_at

      t.timestamps
    end

    add_index :checkr_webhook_events, :checkr_event_id, unique: true
    add_index :checkr_webhook_events, :processed_at
  end
end
