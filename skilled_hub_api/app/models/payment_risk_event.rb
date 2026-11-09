# frozen_string_literal: true

# Durable administrative visibility for post-success ACH/financial problems.
# Does not automatically reverse transfers or claw back technician funds.
class PaymentRiskEvent < ApplicationRecord
  belongs_to :job
  belongs_to :job_payment_transaction, optional: true

  RISK_KINDS = %w[
    pre_success_failure
    post_success_return
    post_success_dispute
    post_success_reversal_unconfirmed
    transfer_executed
    bank_payout_pending
    bank_payout_paid
    payout_unknown
    resolved
  ].freeze

  INVESTIGATION_STATUSES = %w[open reviewing resolved].freeze

  validates :risk_kind, inclusion: { in: RISK_KINDS }
  validates :investigation_status, inclusion: { in: INVESTIGATION_STATUSES }
  validates :detected_at, presence: true

  scope :open_cases, -> { where(investigation_status: %w[open reviewing]) }
  scope :blocking, -> {
    open_cases.where(risk_kind: %w[
      post_success_return
      post_success_dispute
      post_success_reversal_unconfirmed
    ])
  }

  def self.open_for_job?(job)
    blocking.where(job_id: job.id).exists?
  end

  def self.record!(
    job:,
    risk_kind:,
    amount_cents: nil,
    job_payment_transaction: nil,
    stripe_event_id: nil,
    stripe_payment_intent_id: nil,
    stripe_charge_id: nil,
    stripe_refund_id: nil,
    stripe_dispute_id: nil,
    stripe_transfer_id: nil,
    stripe_connected_account_id: nil,
    stripe_payout_id: nil,
    bank_payout_status: "unknown",
    admin_note: nil,
    metadata: {}
  )
    create!(
      job: job,
      job_payment_transaction: job_payment_transaction,
      risk_kind: risk_kind,
      investigation_status: risk_kind.to_s == "resolved" ? "resolved" : "open",
      amount_cents: amount_cents,
      currency: "usd",
      stripe_event_id: stripe_event_id,
      stripe_payment_intent_id: stripe_payment_intent_id,
      stripe_charge_id: stripe_charge_id,
      stripe_refund_id: stripe_refund_id,
      stripe_dispute_id: stripe_dispute_id,
      stripe_transfer_id: stripe_transfer_id,
      stripe_connected_account_id: stripe_connected_account_id,
      stripe_payout_id: stripe_payout_id,
      bank_payout_status: bank_payout_status.presence || "unknown",
      investigation_required: risk_kind.to_s != "resolved",
      admin_note: admin_note,
      metadata_json: metadata,
      detected_at: Time.current,
      resolved_at: (Time.current if risk_kind.to_s == "resolved")
    )
  end

  def resolve!(note: nil)
    update!(
      investigation_status: "resolved",
      investigation_required: false,
      risk_kind: "resolved",
      admin_note: [admin_note, note].compact.join("\n").presence,
      resolved_at: Time.current
    )
  end
end
