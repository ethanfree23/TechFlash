class VerificationBadge < ApplicationRecord
  belongs_to :user

  enum :status, {
    active: 0,
    expired: 1,
    revoked: 2
  }, default: :active

  validates :badge_type, presence: true

  scope :active_now, lambda {
    where(status: :active)
      .where("expires_at IS NULL OR expires_at > ?", Time.current)
  }

  def self.set_active!(user:, badge_type:, source: nil, expires_at: nil)
    badge = find_or_initialize_by(user_id: user.id, badge_type: badge_type)
    badge.source_type = source.class.name if source.present?
    badge.source_id = source.id if source.present? && source.respond_to?(:id)
    badge.status = :active
    badge.earned_at ||= Time.current
    badge.expires_at = expires_at
    badge.save!
    badge
  end
end
