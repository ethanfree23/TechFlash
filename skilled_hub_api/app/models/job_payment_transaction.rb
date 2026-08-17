# frozen_string_literal: true

class JobPaymentTransaction < ApplicationRecord
  belongs_to :payment
  belongs_to :job

  enum :transaction_type, {
    initial_job_charge: 0,
    counteroffer_top_up: 1,
    counteroffer_refund: 2,
    final_hours_top_up: 3,
    final_hours_refund: 4,
    technician_transfer: 5,
    refund: 6,
    transfer_reversal: 7,
    admin_adjustment: 8
  }

  enum :direction, {
    inbound: 0,
    outbound: 1
  }

  enum :status, {
    pending: 0,
    requires_action: 1,
    succeeded: 2,
    failed: 3,
    canceled: 4
  }, prefix: true

  validates :amount_cents, numericality: { greater_than: 0 }
  validates :idempotency_key, presence: true, uniqueness: true
  validates :currency, presence: true

  scope :succeeded, -> { where(status: statuses[:succeeded]) }
  scope :company_collections, -> {
    where(transaction_type: transaction_types.values_at("initial_job_charge", "counteroffer_top_up", "final_hours_top_up"))
  }
  scope :company_refunds, -> {
    where(transaction_type: transaction_types.values_at("counteroffer_refund", "final_hours_refund", "refund"))
  }
end
