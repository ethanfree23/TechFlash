# frozen_string_literal: true

class HardenPaymentRiskEvents < ActiveRecord::Migration[7.0]
  def change
    change_table :payment_risk_events, bulk: true do |t|
      t.string :correlation_key
      t.string :lifecycle_state
      t.integer :confirmed_loss_cents
      t.boolean :exposure_confirmed, null: false, default: false
      t.boolean :transfer_already_executed, null: false, default: false
    end

    # Unique correlation_key (NULLs allowed multiple times on PG/SQLite) — one open case per dispute/return.
    add_index :payment_risk_events, :correlation_key, unique: true,
              name: "index_payment_risk_events_on_correlation_key_unique"
    add_index :payment_risk_events, :stripe_dispute_id
    add_index :payment_risk_events, :lifecycle_state
  end
end
