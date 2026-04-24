class Job < ApplicationRecord

  enum status: { open: 0, reserved: 1, accepted: 2, completed: 3, filled: 4, finished: 5 }

  belongs_to :company_profile

  has_many :job_applications, dependent: :destroy
  has_many :payments, dependent: :destroy

  # Total job amount (before platform fees): hourly_rate * hours_per_day * days
  # Falls back to price_cents for legacy jobs
  def job_amount_cents
    if hourly_rate_cents.present? && hours_per_day.present? && days.present?
      (hourly_rate_cents * hours_per_day * days).to_i
    else
      price_cents || 0
    end
  end

  # What company is charged: job amount + company commission
  def company_charge_cents
    commission_multiplier = company_commission_percent.to_f / 100.0
    (job_amount_cents * (1 + commission_multiplier)).round
  end

  # What tech receives: job amount - technician commission
  def tech_payout_cents
    commission_multiplier = technician_commission_percent.to_f / 100.0
    (job_amount_cents * (1 - commission_multiplier)).round
  end

  before_validation :normalize_job_display_fields

  before_save :sync_price_cents
  before_save :sync_location_from_address
  before_save :geocode_address

  validates :minimum_years_experience, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }

  has_many :conversations, dependent: :destroy
  has_many :ratings, dependent: :destroy
  has_many :job_issue_reports, dependent: :destroy

  # Auto-complete jobs past their scheduled end time
  def self.auto_complete_expired!
    where(status: [:reserved, :filled])
      .where('scheduled_end_at IS NOT NULL AND scheduled_end_at <= ?', Time.current)
      .update_all(status: Job.statuses[:finished], finished_at: Time.current)
  end

  private

  def company_commission_percent
    MembershipPolicy.company_commission_percent(company_profile)
  end

  def technician_commission_percent
    accepted_app = job_applications.find_by(status: :accepted)
    tech_profile = accepted_app&.technician_profile
    MembershipPolicy.technician_commission_percent(tech_profile)
  end

  def normalize_job_display_fields
    self.skill_class = skill_class.to_s.strip.presence
    self.notes = notes.to_s.strip.presence
    if minimum_years_experience.to_s.strip.blank?
      self.minimum_years_experience = nil
    elsif minimum_years_experience.is_a?(String)
      self.minimum_years_experience = minimum_years_experience.to_i
    end
  end

  def sync_price_cents
    return unless hourly_rate_cents.present? && hours_per_day.present? && days.present?
    self.price_cents = (hourly_rate_cents * hours_per_day * days).to_i
  end

  def sync_location_from_address
    return unless city.present? || state.present? || country.present?
    parts = [city, state, country].compact.reject(&:blank?)
    self.location = parts.join(', ') if parts.any?
  end

  def geocode_address
    return unless address.present? || city.present?
    return unless new_record? || address_changed? || city_changed? || state_changed? || zip_code_changed? || country_changed?
    coords = GeocodingService.geocode(
      address: address,
      city: city,
      state: state,
      zip_code: zip_code,
      country: country
    )
    self.latitude = coords[0] if coords
    self.longitude = coords[1] if coords
  rescue StandardError => e
    Rails.logger.warn("Job geocoding failed: #{e.message}")
  end
end
