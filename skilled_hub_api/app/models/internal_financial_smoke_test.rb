# frozen_string_literal: true

# Isolated live ACH collection for operator smoke tests — never tied to a Job or Payment.
class InternalFinancialSmokeTest < ApplicationRecord
  MAX_AMOUNT_CENTS = 500

  belongs_to :company_profile
  belongs_to :authorized_by_user, class_name: "User"
  belongs_to :refund_authorized_by_user, class_name: "User", optional: true

  enum :status, {
    authorized: 0,
    pending: 1,
    processing: 2,
    succeeded: 3,
    failed: 4,
    outcome_unknown: 5,
    requires_action: 6,
    refunded: 7
  }, prefix: true

  validates :authorization_reason, presence: true
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_AMOUNT_CENTS }
  validates :idempotency_key, uniqueness: true, allow_nil: true

  def append_audit!(action:, actor:, reason: nil, metadata: {})
    log = metadata_json.to_h.fetch("audit_log", [])
    log << {
      "action" => action.to_s,
      "actor_user_id" => actor&.id,
      "actor_email" => actor&.email,
      "reason" => reason.to_s.presence,
      "at" => Time.current.iso8601,
      "metadata" => metadata
    }
    update!(metadata_json: metadata_json.to_h.merge("audit_log" => log))
  end

  def charge_consumed?
    charge_initiated_at.present?
  end
end
