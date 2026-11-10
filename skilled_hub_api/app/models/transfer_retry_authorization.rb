# frozen_string_literal: true

# Short-lived, single-use admin grant to retry a technician transfer outside the
# idempotency-safe window. Must be atomically consumed BEFORE Stripe create.
class TransferRetryAuthorization < ApplicationRecord
  belongs_to :job_payment_transaction
  belongs_to :granted_by_user, class_name: "User", optional: true, foreign_key: :granted_by_user_id
  belongs_to :consumed_by_user, class_name: "User", optional: true, foreign_key: :consumed_by_user_id

  STATUSES = %w[granted consumed expired cancelled].freeze
  TTL = 1.hour

  validates :reason, presence: true
  validates :acknowledged_prior_timeout_risk, inclusion: { in: [true] }, on: :create
  validates :status, inclusion: { in: STATUSES }
  validates :token, presence: true, uniqueness: true

  scope :active, -> {
    where(status: "granted", consumed_at: nil).where("expires_at > ?", Time.current)
  }

  def expired?
    expires_at <= Time.current
  end

  def consumable?
    status == "granted" && consumed_at.nil? && !expired?
  end
end
