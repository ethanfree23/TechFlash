class HardenCheckrWebhookStateAndTracking < ActiveRecord::Migration[7.1]
  def change
    change_table :background_checks, bulk: true do |t|
      t.boolean :provider_includes_canceled, null: false, default: false
      t.string :provider_adjudication
      t.datetime :provider_updated_at
      t.string :provider_object_type
    end

    add_index :background_checks, :provider_updated_at
    add_index :background_checks, :provider_includes_canceled

    change_table :checkr_webhook_events, bulk: true do |t|
      t.datetime :received_at
      t.datetime :processing_started_at
      t.text :processing_error
      t.integer :attempt_count, null: false, default: 0
      t.string :object_type
      t.string :object_id
      t.integer :background_check_id
      t.boolean :hydrated, null: false, default: false
      t.boolean :duplicate, null: false, default: false
    end

    add_index :checkr_webhook_events, :received_at
    add_index :checkr_webhook_events, :processing_started_at
    add_index :checkr_webhook_events, :attempt_count
    add_index :checkr_webhook_events, :background_check_id
    add_index :checkr_webhook_events, [:object_type, :object_id]
  end
end
