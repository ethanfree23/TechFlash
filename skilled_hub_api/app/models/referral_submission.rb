class ReferralSubmission < ApplicationRecord
  REFERRED_TYPES = %w[tech biz].freeze

  belongs_to :referrer_user, class_name: "User", inverse_of: :sent_referrals
  belongs_to :referred_user, class_name: "User", optional: true, inverse_of: :received_referrals
  belongs_to :crm_lead, optional: true

  validates :first_name, :last_name, :email, :referred_type, presence: true
  validates :referred_type, inclusion: { in: REFERRED_TYPES }

  before_validation :normalize_fields

  scope :reward_pending, -> { where(reward_eligible_at: nil) }

  private

  def normalize_fields
    self.first_name = first_name.to_s.strip
    self.last_name = last_name.to_s.strip
    self.cell_phone = cell_phone.to_s.strip.presence
    self.email = email.to_s.strip.downcase
    self.location = location.to_s.strip.presence
    self.extra_info = extra_info.to_s.strip.presence
    self.referred_type = referred_type.to_s.strip.downcase
  end
end
