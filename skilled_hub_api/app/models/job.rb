class Job < ApplicationRecord
  include ContentSafetyValidations

  has_secure_token :share_token

  enum :status, { open: 0, reserved: 1, accepted: 2, completed: 3, filled: 4, finished: 5 }
  enum :start_mode, { hard_start: 0, rolling_start: 1 }
  enum :rolling_start_rule_type, {
    none: 0,
    exact_datetime: 1,
    days_after_acceptance: 2,
    following_weekday: 3
  }, scopes: false
  enum :weekend_work_policy, {
    prohibited: 0,
    optional: 1,
    required: 2
  }, scopes: false
  enum :saturday_work_policy, {
    unavailable: 0,
    normal_rate: 1,
    premium_rate: 2
  }, scopes: false, prefix: :saturday
  enum :sunday_work_policy, {
    unavailable: 0,
    normal_rate: 1,
    premium_rate: 2
  }, scopes: false, prefix: :sunday
  enum :premium_combination_rule, {
    highest_applicable: 0,
    stacked: 1
  }, scopes: false

  belongs_to :company_profile

  has_many :job_applications, dependent: :destroy
  has_many :payments, dependent: :destroy
  has_many :job_counter_offers, dependent: :destroy
  has_many :weekend_work_requests, dependent: :destroy
  has_many :time_entries, dependent: :destroy
  has_many :job_term_change_audits, dependent: :destroy

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
  before_validation :normalize_schedule_fields
  before_validation :normalize_trade_type

  before_save :sync_price_cents
  before_save :sync_location_from_address
  before_save :geocode_address

  validates :minimum_years_experience, numericality: { only_integer: true, greater_than_or_equal_to: 0, allow_nil: true }
  validates :minimum_verified_references, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :overtime_multiplier, numericality: { greater_than_or_equal_to: 1.0, less_than_or_equal_to: 3.0 }, allow_nil: true
  validates :saturday_multiplier, numericality: { greater_than_or_equal_to: 1.0, less_than_or_equal_to: 3.0 }, allow_nil: true
  validates :sunday_multiplier, numericality: { greater_than_or_equal_to: 1.0, less_than_or_equal_to: 3.0 }, allow_nil: true
  validates_safe_text :title, :description, :notes, :skill_class, max_length: 4_000
  has_many :conversations, dependent: :destroy
  has_many :ratings, dependent: :destroy
  has_many :job_issue_reports, dependent: :destroy
  validate :validate_schedule_rules
  validate :validate_trade_type
  validate :validate_rolling_start_rule
  validate :validate_weekend_policy_rules
  validate :validate_overtime_fields
  validate :validate_shift_time_windows

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

  def normalize_trade_type
    normalized = TradeCatalog.normalized_label(trade_type)
    self.trade_type = normalized if normalized.present?
  end

  def normalize_schedule_fields
    self.standard_work_days = normalize_weekday_list(standard_work_days.presence || [1, 2, 3, 4, 5])
    self.standard_day_shifts = normalize_shift_map(standard_day_shifts)
    self.weekend_day_shifts = normalize_shift_map(weekend_day_shifts)
    self.job_timezone = job_timezone.to_s.strip.presence || "UTC"
    self.daily_overtime_threshold_hours = daily_overtime_threshold_hours.presence&.to_d
    self.weekly_overtime_threshold_hours = weekly_overtime_threshold_hours.presence&.to_d
    self.overtime_multiplier = overtime_multiplier.presence&.to_d
    self.saturday_multiplier = saturday_multiplier.presence&.to_d
    self.sunday_multiplier = sunday_multiplier.presence&.to_d
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
    return unless latitude.blank? || longitude.blank? || new_record? || address_changed? || city_changed? || state_changed? || zip_code_changed? || country_changed?
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

  def normalize_weekday_list(raw_days)
    list = Array(raw_days).map { |d| d.to_i }.select { |d| d.between?(1, 7) }.uniq.sort
    list.presence || [1, 2, 3, 4, 5]
  end

  def normalize_shift_map(raw_map)
    (raw_map || {}).to_h.each_with_object({}) do |(day_key, shift), acc|
      day = day_key.to_i
      next unless day.between?(1, 7)
      next unless shift.is_a?(Hash)

      start_at = shift["start_time"].to_s
      end_at = shift["end_time"].to_s
      next unless start_at.match?(/\A\d{2}:\d{2}\z/) && end_at.match?(/\A\d{2}:\d{2}\z/)

      acc[day.to_s] = { "start_time" => start_at, "end_time" => end_at }
    end
  end

  def validate_schedule_rules
    return if standard_work_days.blank?

    invalid = standard_work_days.reject { |d| d.to_i.between?(1, 7) }
    errors.add(:standard_work_days, "must use weekdays Monday through Sunday.") if invalid.any?
  end

  def validate_trade_type
    return if trade_type.blank?
    return if TradeCatalog.valid_label?(trade_type)

    errors.add(:trade_type, "must be selected from the approved trade list.")
  end

  def validate_rolling_start_rule
    return unless rolling_start?
    return if rolling_start_rule_type.present? && rolling_start_rule_type != "none"

    errors.add(:rolling_start_rule_type, "must be configured by the company for rolling start jobs.")
  end

  def validate_weekend_policy_rules
    if prohibited?
      if standard_work_days.include?(6) || standard_work_days.include?(7)
        errors.add(:standard_work_days, "cannot include Saturday or Sunday when weekend work is not allowed.")
      end
      if !saturday_unavailable? || !sunday_unavailable?
        errors.add(:base, "Saturday and Sunday must be unavailable when weekend work is prohibited.")
      end
    end

    if required? && saturday_unavailable? && sunday_unavailable?
      errors.add(:base, "Choose Saturday, Sunday, or both when weekend work is required.")
    end

    if optional? && saturday_unavailable? && sunday_unavailable?
      errors.add(:base, "Choose at least one weekend day that may be offered.")
    end

    if saturday_premium_rate? && saturday_multiplier.blank?
      errors.add(:saturday_multiplier, "is required when Saturday premium pay is selected.")
    end
    if sunday_premium_rate? && sunday_multiplier.blank?
      errors.add(:sunday_multiplier, "is required when Sunday premium pay is selected.")
    end
  end

  def validate_overtime_fields
    if overtime_enabled
      if daily_overtime_threshold_hours.blank? && weekly_overtime_threshold_hours.blank?
        errors.add(:base, "Set a daily or weekly overtime threshold when overtime is enabled.")
      end
      if overtime_multiplier.blank?
        errors.add(:overtime_multiplier, "is required when overtime is enabled.")
      end
    end
  end

  def validate_shift_time_windows
    merged = standard_day_shifts.merge(weekend_day_shifts)
    merged.each_value do |shift|
      start_at = shift["start_time"]
      end_at = shift["end_time"]
      next if start_at.blank? || end_at.blank?
      next if end_at > start_at

      errors.add(:base, "Shift end time must be after shift start time.")
      break
    end
  end
end
