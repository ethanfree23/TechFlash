class Coupon < ApplicationRecord
  DISCOUNT_KINDS = %w[percent fixed_cents].freeze
  DURATION_TEMPLATES = %w[fixed_window one_month three_months custom_days].freeze

  has_many :coupon_assignments, dependent: :destroy

  validates :name, presence: true
  validates :code, presence: true, uniqueness: { case_sensitive: false }
  validates :discount_kind, inclusion: { in: DISCOUNT_KINDS }
  validates :duration_template, inclusion: { in: DURATION_TEMPLATES }

  before_validation :normalize_code

  def active_now?
    return false unless active?
    return false if starts_at.present? && starts_at > Time.current
    return false if ends_at.present? && ends_at < Time.current

    true
  end

  private

  def normalize_code
    self.code = code.to_s.strip.upcase
  end
end
