class VerificationReference < ApplicationRecord
  belongs_to :technician_user, class_name: "User"
  belongs_to :reviewed_by_user, class_name: "User", optional: true

  enum :status, {
    requested: 0,
    responded: 1,
    approved: 2,
    rejected: 3
  }, default: :requested

  validates :full_name, presence: true
  validates :email, :relationship, presence: true, unless: :phone_first_pending?
  validates :request_token, presence: true, uniqueness: true
  validate :email_unique_for_technician
  validate :phone_unique_for_technician, if: :phone_normalized_present?

  before_validation :normalize_contact_fields
  before_validation :ensure_request_token, on: :create

  scope :pending_review, -> { where(status: :responded).order(responded_at: :asc) }

  private

  def phone_first_pending?
    email.to_s.strip.blank? && phone.to_s.strip.present?
  end

  def normalize_contact_fields
    self.email_normalized = email.to_s.strip.downcase.presence
    self.phone_normalized = GhlPhoneNormalizer.normalize(phone)
  end

  def phone_normalized_present?
    phone_normalized.present?
  end

  def email_unique_for_technician
    return if technician_user_id.blank? || email_normalized.blank?

    existing = self.class
      .where(technician_user_id: technician_user_id, email_normalized: email_normalized)
      .where.not(id: id)
      .exists?

    errors.add(:email, "has already been used for another reference") if existing
  end

  def phone_unique_for_technician
    return if technician_user_id.blank?

    existing = self.class
      .where(technician_user_id: technician_user_id, phone_normalized: phone_normalized)
      .where.not(id: id)
      .exists?

    errors.add(:phone, "has already been used for another reference") if existing
  end

  def ensure_request_token
    self.request_token ||= SecureRandom.hex(24)
  end
end
