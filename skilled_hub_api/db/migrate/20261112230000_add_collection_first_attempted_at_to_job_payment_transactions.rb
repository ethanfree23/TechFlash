# frozen_string_literal: true

# Stamped before the first Stripe PaymentIntent.create for a collection attempt so a timeout
# or crash can never lose the fact that Stripe may have been reached. Drives the same-key
# retry window and the age of unresolved outcome_unknown collections.
class AddCollectionFirstAttemptedAtToJobPaymentTransactions < ActiveRecord::Migration[7.0]
  def change
    add_column :job_payment_transactions, :collection_first_attempted_at, :datetime
    add_index :job_payment_transactions, :collection_first_attempted_at,
              name: "idx_jpt_on_collection_first_attempted_at"
  end
end
