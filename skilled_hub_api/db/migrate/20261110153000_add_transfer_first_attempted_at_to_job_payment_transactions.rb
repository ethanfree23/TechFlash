# frozen_string_literal: true

class AddTransferFirstAttemptedAtToJobPaymentTransactions < ActiveRecord::Migration[7.0]
  def change
    add_column :job_payment_transactions, :transfer_first_attempted_at, :datetime
  end
end
