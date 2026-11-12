# frozen_string_literal: true

class CreateInternalFinancialSmokeTests < ActiveRecord::Migration[7.1]
  def change
    create_table :internal_financial_smoke_tests do |t|
      t.references :company_profile, null: false, foreign_key: true
      t.integer :authorized_by_user_id, null: false
      t.text :authorization_reason, null: false
      t.integer :amount_cents, null: false
      t.string :idempotency_key
      t.integer :status, null: false, default: 0
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.string :stripe_refund_id
      t.string :stripe_payment_method_id
      t.string :payment_method_type
      t.string :payment_method_last4
      t.string :payment_method_bank_name
      t.text :error_message
      t.boolean :investigation_required, default: false, null: false
      t.datetime :charge_initiated_at
      t.datetime :processing_at
      t.datetime :succeeded_at
      t.datetime :refunded_at
      t.integer :refund_authorized_by_user_id
      t.text :refund_authorization_reason
      t.json :metadata_json, default: {}, null: false

      t.timestamps
    end

    add_index :internal_financial_smoke_tests, :idempotency_key, unique: true
    add_index :internal_financial_smoke_tests, :stripe_payment_intent_id
    add_index :internal_financial_smoke_tests, :status
    add_foreign_key :internal_financial_smoke_tests, :users, column: :authorized_by_user_id
    add_foreign_key :internal_financial_smoke_tests, :users, column: :refund_authorized_by_user_id
  end
end
