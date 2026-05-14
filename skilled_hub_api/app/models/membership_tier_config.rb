# frozen_string_literal: true

class MembershipTierConfig < ApplicationRecord
  AUDIENCES = %w[technician company].freeze
  SLUG_REGEX = /\A[a-z0-9_]+\z/

  validates :audience, inclusion: { in: AUDIENCES }
  validates :slug, presence: true, uniqueness: { scope: :audience }, format: { with: SLUG_REGEX, message: "must be lowercase letters, numbers, or underscores" }
  validates :monthly_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :yearly_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :commission_percent, numericality: { greater_than_or_equal_to: 0 }
  validates :sort_order, numericality: { only_integer: true }
  validates :job_access_min_experience_years, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }
  validates :job_access_min_jobs_completed, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }
  validates :job_access_min_successful_jobs, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }
  validates :job_access_min_profile_completeness_percent, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 100, allow_nil: true }
  validate :early_access_only_for_technician
  validate :standard_technician_tier_delay_order

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
      h[:job_access_min_jobs_completed] = job_access_min_jobs_completed.to_i
      h[:job_access_min_successful_jobs] = job_access_min_successful_jobs.to_i
      h[:job_access_min_profile_completeness_percent] = job_access_min_profile_completeness_percent.to_i
      h[:job_access_requires_verified_background] = !!job_access_requires_verified_background
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

  def standard_technician_tier_delay_order
    return unless audience == "technician"
    return unless %w[premium pro basic].include?(slug)

    tiers = MembershipTierConfig.where(audience: "technician", slug: %w[premium pro basic]).index_by(&:slug)
    tiers[slug] = self
    return unless tiers["premium"] && tiers["pro"] && tiers["basic"]

    premium_delay = tiers["premium"].early_access_delay_hours.to_i
    pro_delay = tiers["pro"].early_access_delay_hours.to_i
    basic_delay = tiers["basic"].early_access_delay_hours.to_i
    return if premium_delay <= pro_delay && pro_delay <= basic_delay

    errors.add(:early_access_delay_hours, "must keep release order premium first, then pro, then basic")
  end
end
