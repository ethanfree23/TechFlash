# frozen_string_literal: true

class CreatePaymentRiskEventsAndSetupRecords < ActiveRecord::Migration[7.0]
  def change
    create_table :payment_risk_events do |t|
      t.references :job, null: false, foreign_key: true
      t.references :job_payment_transaction, null: true, foreign_key: true
      t.string :risk_kind, null: false
      t.string :investigation_status, null: false, default: "open"
      t.integer :amount_cents
      t.string :currency, default: "usd", null: false
      t.string :stripe_event_id
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.string :stripe_refund_id
      t.string :stripe_dispute_id
      t.string :stripe_transfer_id
      t.string :stripe_connected_account_id
      t.string :stripe_payout_id
      t.string :bank_payout_status, default: "unknown", null: false
      t.boolean :investigation_required, null: false, default: true
      t.text :admin_note
      t.json :metadata_json, default: {}, null: false
      t.datetime :detected_at, null: false
      t.datetime :resolved_at
      t.timestamps
    end

    add_index :payment_risk_events, :risk_kind
    add_index :payment_risk_events, :investigation_status
    add_index :payment_risk_events, :stripe_event_id
    add_index :payment_risk_events, :stripe_payment_intent_id
    add_index :payment_risk_events, [:job_id, :investigation_status]

    create_table :stripe_setup_records do |t|
      t.references :user, null: false, foreign_key: true
      t.string :stripe_setup_intent_id, null: false
      t.string :stripe_customer_id
      t.string :stripe_payment_method_id
      t.string :payment_method_type
      t.string :status, null: false, default: "requires_action"
      t.string :error_message
      t.json :metadata_json, default: {}, null: false
      t.datetime :succeeded_at
      t.datetime :failed_at
      t.timestamps
    end

    add_index :stripe_setup_records, :stripe_setup_intent_id, unique: true
    add_index :stripe_setup_records, :stripe_payment_method_id
    add_index :stripe_setup_records, [:user_id, :status]

    change_table :job_payment_transactions, bulk: true do |t|
      t.boolean :investigation_required, null: false, default: false
      t.string :source_charge_id
      t.string :bank_payout_status
    end
  end
end
