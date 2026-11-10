# frozen_string_literal: true

class AddOutcomeUnknownAndDisputeEventTimes < ActiveRecord::Migration[7.0]
  def change
    # Integer-backed enum value outcome_unknown=6 needs no column change on job_payment_transactions.
    change_table :payment_risk_events, bulk: true do |t|
      t.datetime :last_stripe_event_created_at
      t.string :resolved_by
      t.datetime :reopened_at
      t.string :reopened_by_event_id
    end
  end
end
