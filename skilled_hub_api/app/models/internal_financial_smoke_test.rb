# frozen_string_literal: true

# One-shot, admin-authorized production ACH smoke test. Deliberately isolated from every job
# money path: no Job, Payment, JobPaymentTransaction, JobLedger, transfer_group, or payout can
# reference a row here. The only Stripe write it ever performs is a single PaymentIntent create
# under a stable idempotency key; refunds are a separate owner authorization.
class InternalFinancialSmokeTest < ApplicationRecord
  MAX_AMOUNT_CENTS = 500
  CURRENCY = "usd"
  METADATA_MARKER = "techflash_internal_smoke_test"

  STATUSES = %w[authorized processing succeeded failed outcome_unknown].freeze
  # A debit is "attempted" once a Stripe create has been started; such rows may never be
  # re-executed except through the same-key reconciliation policy.
  ATTEMPTED_STATUSES = %w[processing succeeded failed outcome_unknown].freeze
  RECONCILIATION_STATUSES = %w[none pending_reconciliation reconciled requires_admin].freeze

  belongs_to :company_profile
  belongs_to :operator_user, class_name: "User"

  validates :public_id, :authorization_reference, :authorization_reason, :idempotency_key, presence: true
  validates :public_id, :authorization_reference, :idempotency_key, uniqueness: true
  validates :authorized_at, presence: true
  validates :stripe_customer_id, :stripe_payment_method_id, presence: true
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_AMOUNT_CENTS }
  validates :currency, inclusion: { in: [CURRENCY] }
  validates :status, inclusion: { in: STATUSES }
  validates :reconciliation_status, inclusion: { in: RECONCILIATION_STATUSES }
  validate :amount_is_immutable, on: :update

  before_validation :assign_identifiers, on: :create

  scope :unresolved, -> { where(status: %w[processing outcome_unknown]) }

  def self.generate_public_id
    "ifst_#{SecureRandom.hex(8)}"
  end

  def attempted?
    ATTEMPTED_STATUSES.include?(status)
  end

  def terminal?
    %w[succeeded failed].include?(status)
  end

  # Append-only history. Never rewrites earlier entries.
  def append_history!(kind, **data)
    entry = { "kind" => kind.to_s, "at" => Time.current.iso8601 }.merge(data.transform_keys(&:to_s))
    update!(history_json: Array(history_json) + [entry])
    entry
  end

  def record_webhook_event!(event_id)
    return false if event_id.blank?
    ids = Array(webhook_event_ids)
    return false if ids.include?(event_id.to_s)

    update!(webhook_event_ids: ids + [event_id.to_s])
    true
  end

  def stripe_metadata
    {
      METADATA_MARKER => "true",
      "internal_smoke_test_id" => public_id,
      "company_profile_id" => company_profile_id.to_s,
      "authorization_reference" => authorization_reference,
      "operator_user_id" => operator_user_id.to_s,
      "not_job_funding" => "true"
    }
  end

  private

  def assign_identifiers
    self.public_id = self.class.generate_public_id if public_id.blank?
    self.idempotency_key = "tf_smoke_#{public_id}" if idempotency_key.blank?
    self.currency = CURRENCY if currency.blank?
  end

  def amount_is_immutable
    return unless will_save_change_to_amount_cents? || will_save_change_to_currency? ||
                  will_save_change_to_idempotency_key? || will_save_change_to_authorization_reference? ||
                  will_save_change_to_company_profile_id?

    errors.add(:base, "authorization fields are immutable after creation")
  end
end
