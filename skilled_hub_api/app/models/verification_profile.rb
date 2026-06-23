class VerificationProfile < ApplicationRecord
  belongs_to :user

  enum :identity_status, {
    not_started: 0,
    pending: 1,
    verified: 2,
    rejected: 3
  }, default: :not_started, prefix: true

  enum :background_status, {
    not_started: 0,
    pending: 1,
    verified: 2,
    rejected: 3
  }, default: :not_started, prefix: true

  enum :references_status, {
    not_started: 0,
    pending: 1,
    verified: 2
  }, default: :not_started, prefix: true

  enum :licenses_status, {
    not_started: 0,
    pending: 1,
    verified: 2,
    expired: 3
  }, default: :not_started, prefix: true

  enum :insurance_status, {
    not_started: 0,
    pending: 1,
    verified: 2,
    expired: 3
  }, default: :not_started, prefix: true

  validates :overall_completion_percentage, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }

  def self.for_user!(user)
    find_or_create_by!(user_id: user.id) do |profile|
      profile.email_verified = user.email.present?
      profile.phone_verified = user.phone.present?
    end
  end
end
