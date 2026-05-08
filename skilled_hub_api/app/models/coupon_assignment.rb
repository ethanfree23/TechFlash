class CouponAssignment < ApplicationRecord
  STATUSES = %w[active expired cancelled].freeze

  belongs_to :coupon
  belongs_to :user
  belongs_to :assigned_by, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }

  scope :active_now, lambda {
    where(status: "active")
      .where("starts_at IS NULL OR starts_at <= ?", Time.current)
      .where("expires_at IS NULL OR expires_at >= ?", Time.current)
  }

  def remaining_seconds
    return nil if expires_at.blank?

    [expires_at.to_i - Time.current.to_i, 0].max
  end
end
