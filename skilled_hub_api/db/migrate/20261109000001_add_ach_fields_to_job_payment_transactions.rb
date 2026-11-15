# frozen_string_literal: true

class AddAchFieldsToJobPaymentTransactions < ActiveRecord::Migration[7.0]
  def change
    change_table :job_payment_transactions, bulk: true do |t|
      t.string :payment_method_type
      t.string :payment_method_last4
      t.string :payment_method_brand
      t.string :payment_method_bank_name
      t.string :stripe_payment_method_id
      t.datetime :processing_at
      t.string :dispute_status
      t.string :stripe_dispute_id
    end

    add_index :job_payment_transactions, :payment_method_type
    add_index :job_payment_transactions, :dispute_status
    add_index :job_payment_transactions, :status
  end
end
