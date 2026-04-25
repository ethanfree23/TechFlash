# frozen_string_literal: true

class MembershipTierConfig < ApplicationRecord
  AUDIENCES = %w[technician company].freeze
  SLUG_REGEX = /\A[a-z0-9_]+\z/

  validates :audience, inclusion: { in: AUDIENCES }
  validates :slug, presence: true, uniqueness: { scope: :audience }, format: { with: SLUG_REGEX, message: "must be lowercase letters, numbers, or underscores" }
  validates :monthly_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :commission_percent, numericality: { greater_than_or_equal_to: 0 }
  validates :sort_order, numericality: { only_integer: true }
  validates :job_access_min_experience_years, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }
  validate :early_access_only_for_technician

  after_commit :clear_membership_tier_cache

  scope :for_audience, ->(audience) { where(audience: audience.to_s).order(:sort_order, :id) }

  def rules_hash
    h = {
      fee_cents: monthly_fee_cents,
      commission_percent: commission_percent.to_f
    }
    if audience == "technician"
      h[:early_access_delay_hours] = (early_access_delay_hours || 0).to_i
      h[:job_access_min_experience_years] = job_access_min_experience_years.to_i
    end
    h
  end

  def in_use?
    if audience == "company"
      CompanyProfile.exists?(membership_level: slug)
    else
      TechnicianProfile.exists?(membership_level: slug)
    end
  end

  private

  def clear_membership_tier_cache
    MembershipPolicy.invalidate_cache!
  end

  def early_access_only_for_technician
    return if audience == "technician"
    return if early_access_delay_hours.blank?

    errors.add(:early_access_delay_hours, "only applies to technician tiers")
  end
end
