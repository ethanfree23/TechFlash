class VerificationReference < ApplicationRecord
  belongs_to :technician_user, class_name: "User"
  belongs_to :reviewed_by_user, class_name: "User", optional: true

  enum :status, {
    requested: 0,
    responded: 1,
    approved: 2,
    rejected: 3
  }, default: :requested

  validates :full_name, :email, :relationship, presence: true
  validates :request_token, presence: true, uniqueness: true

  before_validation :ensure_request_token, on: :create

  scope :pending_review, -> { where(status: :responded).order(responded_at: :asc) }

  private

  def ensure_request_token
    self.request_token ||= SecureRandom.hex(24)
  end
end
