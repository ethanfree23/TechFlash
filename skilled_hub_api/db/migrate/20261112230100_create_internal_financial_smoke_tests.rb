# frozen_string_literal: true

# Isolated, admin-only, one-shot ACH production smoke test. Deliberately NOT a Job, Payment, or
# JobPaymentTransaction: rows here never enter the job ledger, settlement, or technician payout.
class CreateInternalFinancialSmokeTests < ActiveRecord::Migration[7.0]
  def change
    create_table :internal_financial_smoke_tests do |t|
      t.string :public_id, null: false
      t.integer :company_profile_id, null: false
      t.integer :operator_user_id, null: false
      t.string :operator_email
      t.string :authorization_reference, null: false
      t.datetime :authorized_at, null: false
      t.text :authorization_reason, null: false
      t.integer :amount_cents, null: false
      t.string :currency, null: false, default: "usd"
      t.string :stripe_customer_id, null: false
      t.string :stripe_payment_method_id, null: false
      t.string :idempotency_key, null: false
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.string :status, null: false, default: "authorized"
      t.string :reconciliation_status, null: false, default: "none"
      t.string :dispute_status
      t.string :stripe_dispute_id
      t.boolean :livemode
      t.text :error_message
      t.string :error_class
      t.json :webhook_event_ids, null: false, default: []
      t.json :history_json, null: false, default: []
      t.datetime :first_attempted_at
      t.datetime :last_attempted_at
      t.datetime :processing_at
      t.datetime :succeeded_at
      t.datetime :failed_at
      t.timestamps
    end
    add_index :internal_financial_smoke_tests, :public_id, unique: true, name: "idx_ifst_on_public_id"
    add_index :internal_financial_smoke_tests, :idempotency_key, unique: true, name: "idx_ifst_on_idempotency_key"
    add_index :internal_financial_smoke_tests, :authorization_reference, unique: true, name: "idx_ifst_on_authorization_reference"
    add_index :internal_financial_smoke_tests, :stripe_payment_intent_id, name: "idx_ifst_on_stripe_payment_intent_id"
    add_index :internal_financial_smoke_tests, :stripe_charge_id, name: "idx_ifst_on_stripe_charge_id"
    add_index :internal_financial_smoke_tests, :company_profile_id, name: "idx_ifst_on_company_profile_id"
    add_index :internal_financial_smoke_tests, :status, name: "idx_ifst_on_status"
  end
end
