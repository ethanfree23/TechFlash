class BackgroundCheck < ApplicationRecord
  belongs_to :user

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

  scope :active_or_processing, -> { where(status: %i[invited pending processing]) }
  scope :eligible_clear, -> { where(status: %i[clear manually_approved]) }

  def eligible_for_background_gate?
    clear? || manually_approved?
  end
end
