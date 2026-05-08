class CreateNotificationTables < ActiveRecord::Migration[7.1]
  def change
    create_table :job_alert_preferences do |t|
      # One unique index on user_id (plain `references` also adds an index — do not add_index again).
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :trade_label
      t.integer :min_hourly_rate_cents, null: false, default: 0
      t.integer :max_distance_miles, null: false, default: 200
      t.integer :max_duration_days, null: false, default: 365
      t.boolean :email_enabled, null: false, default: true
      t.boolean :sms_enabled, null: false, default: true
      t.boolean :app_enabled, null: false, default: true
      t.timestamps
    end

    create_table :app_notifications do |t|
      t.references :user, null: false, foreign_key: true
      t.string :category, null: false
      t.string :title, null: false
      t.text :body
      # SQLite has no jsonb; use json for dev/test and jsonb on PostgreSQL.
      if connection.adapter_name.match?(/\Apostgresql\z/i)
        t.jsonb :metadata, null: false, default: {}
      else
        t.json :metadata, null: false, default: {}
      end
      t.datetime :read_at
      t.timestamps
    end

    create_table :sms_delivery_logs do |t|
      t.references :user, null: false, foreign_key: true
      t.string :category, null: false
      t.string :destination, null: false
      t.text :message
      t.string :status, null: false, default: "queued"
      t.text :error_message
      t.timestamps
    end
  end
end
