# frozen_string_literal: true

class AddGhlTechnicianOnboarding < ActiveRecord::Migration[7.1]
  def up
    add_column :users, :ghl_contact_id, :string
    add_column :users, :ghl_location_id, :string
    add_column :users, :ghl_conversation_id, :string
    add_column :users, :ghl_onboarded_at, :datetime
    add_column :users, :phone_normalized, :string
    add_column :users, :ghl_intake_contact_info, :text
    add_column :users, :ghl_intake_references, :text

    add_index :users, :ghl_contact_id, unique: true
    add_index :users, :phone_normalized

    create_table :ghl_webhook_events do |t|
      t.string :idempotency_key, null: false
      t.string :ghl_contact_id
      t.string :event_type, default: "technician_onboarding"
      t.json :payload
      t.integer :user_id
      t.datetime :processed_at
      t.text :processing_error
      t.integer :attempt_count, null: false, default: 0

      t.timestamps
    end

    add_index :ghl_webhook_events, :idempotency_key, unique: true
    add_index :ghl_webhook_events, :ghl_contact_id
    add_index :ghl_webhook_events, :user_id
    add_foreign_key :ghl_webhook_events, :users

    change_column_null :verification_references, :email, true
    change_column_null :verification_references, :relationship, true

    backfill_phone_normalized
  end

  def down
    remove_foreign_key :ghl_webhook_events, :users
    drop_table :ghl_webhook_events

    remove_index :users, :ghl_contact_id
    remove_index :users, :phone_normalized
    remove_column :users, :ghl_intake_references
    remove_column :users, :ghl_intake_contact_info
    remove_column :users, :phone_normalized
    remove_column :users, :ghl_onboarded_at
    remove_column :users, :ghl_conversation_id
    remove_column :users, :ghl_location_id
    remove_column :users, :ghl_contact_id

    change_column_null :verification_references, :email, false
    change_column_null :verification_references, :relationship, false
  end

  private

  def backfill_phone_normalized
    say_with_time "backfill users.phone_normalized" do
      User.reset_column_information
      User.find_each do |user|
        digits = user.phone.to_s.gsub(/\D/, "")
        digits = digits[1..] if digits.length == 11 && digits.start_with?("1")
        next if digits.blank?

        User.where(id: user.id).update_all(phone_normalized: digits)
      end
    end
  end
end
