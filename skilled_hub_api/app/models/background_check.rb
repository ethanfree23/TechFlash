class BackgroundCheck < ApplicationRecord
  belongs_to :user
  belongs_to :job, optional: true
  belongs_to :job_application, optional: true
  belongs_to :company_profile, optional: true

  NORMALIZED_STATUSES = %w[
    pending
    invitation_sent
    invitation_completed
    report_pending
    report_suspended
    report_complete
    clear
    consider
    canceled
    not_started
  ].freeze

  enum :status, {
    not_started: 0,
    invited: 1,
    pending: 2,
    processing: 3,
    clear: 4,
    consider: 5,
    suspended: 6,
    expired: 7,
    failed: 8,
    manually_approved: 9,
    manually_rejected: 10
  }, default: :not_started

  enum :payment_status, {
    not_required: 0,
    pending: 1,
    paid: 2,
    waived: 3,
    failed: 4
  }, default: :not_required, prefix: true

  enum :admin_override_status, {
    none: 0,
    manually_approved: 1,
    manually_rejected: 2
  }, default: :none, prefix: true

  validates :provider, presence: true
  validates :paid_by, inclusion: { in: %w[technician premium admin company] }
  validates :normalized_status, inclusion: { in: NORMALIZED_STATUSES }, allow_blank: true

  scope :active_or_processing, -> { where(status: %i[invited pending processing]) }
  scope :eligible_clear, -> { where(status: %i[clear manually_approved]) }

  def eligible_for_background_gate?
    clear? || manually_approved?
  end

  def normalized_status_value
    normalized_status.presence || legacy_status_to_normalized
  end

  def monitoring_status
    {
      normalized_status: normalized_status_value,
      provider_status: provider_status,
      provider_assess_status: provider_assess_status,
      result: result,
      report_eta_at: report_eta_at
    }
  end

  private

  def legacy_status_to_normalized
    return "not_started" if not_started?
    return "invitation_sent" if invited?
    return "report_pending" if pending? || processing?
    return "report_suspended" if suspended?
    return "clear" if clear? || manually_approved?
    return "consider" if consider?

    "canceled"
  end
end
