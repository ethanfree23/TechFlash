class AddPaymentFieldsToBackgroundChecks < ActiveRecord::Migration[7.1]
  def change
    change_table :background_checks, bulk: true do |t|
      t.integer :payment_amount_cents
      t.string :stripe_checkout_session_id
      t.string :stripe_payment_intent_id
      t.datetime :paid_at
    end

    add_index :background_checks, :stripe_checkout_session_id
    add_index :background_checks, :stripe_payment_intent_id
  end
end
