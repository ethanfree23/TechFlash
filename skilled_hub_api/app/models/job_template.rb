# frozen_string_literal: true

# A reusable job configuration owned by a company.
#
# Reusable job attributes live in `configuration` keyed by Job column name, so a template
# keeps up with the Job schema. Anything unique to an individual posting (identity, status,
# claim, payment, actual times) is deliberately excluded - see REUSABLE_FIELDS.
class JobTemplate < ApplicationRecord
  # Job attributes that describe *what kind of work this is*, and are therefore safe to
  # reuse across postings.
  REUSABLE_FIELDS = %w[
    title
    description
    notes
    timeline
    trade_type
    skill_class
    minimum_years_experience
    required_documents
    required_certifications
    require_background_check
    require_identity_verification
    require_insurance_verification
    minimum_verified_references
    hourly_rate_cents
    hours_per_day
    days
    pay_basis
    potential_full_time
    potential_full_time_details
    schedule_flexibility
    start_mode
    rolling_start_rule_type
    rolling_start_days_after_acceptance
    rolling_start_weekday
    rolling_start_weekday_time
    standard_work_days
    standard_day_shifts
    weekend_day_shifts
    weekend_work_policy
    saturday_work_policy
    sunday_work_policy
    saturday_multiplier
    sunday_multiplier
    weekend_requires_company_approval
    weekend_requires_technician_acceptance
    premium_combination_rule
    overtime_enabled
    daily_overtime_threshold_hours
    weekly_overtime_threshold_hours
    overtime_multiplier
    job_timezone
    address
    city
    state
    zip_code
    country
  ].freeze

  # Never copied. Each of these belongs to one specific posting.
  EXCLUDED_FIELDS = %w[
    id
    company_profile_id
    status
    created_at
    updated_at
    finished_at
    scheduled_start_at
    scheduled_end_at
    hard_deadline_at
    go_live_at
    share_token
    price_cents
    agreed_hourly_rate_cents
    agreed_labor_cents
    estimated_hours
    company_commission_percent_snapshot
    technician_commission_percent_snapshot
    company_membership_tier_config_id
    technician_membership_tier_config_id
    funding_status
    settlement_status
    financial_revision
    rolling_start_exact_start_at
    latitude
    longitude
    location
    terminated_at
  ].freeze

  # Schedule shape captured alongside the reusable fields so a template can recreate the
  # same duration and daily hours from a new start date.
  SCHEDULE_META_KEYS = %w[schedule_start_time schedule_working_day_span].freeze

  belongs_to :company_profile
  belongs_to :created_by_user, class_name: "User", optional: true

  validates :name, presence: true, length: { maximum: 120 }
  validates :name, uniqueness: { scope: :company_profile_id, case_sensitive: false }
  validate :configuration_is_a_hash

  before_validation :normalize_name
  before_validation :sync_denormalized_columns

  scope :recently_updated, -> { order(updated_at: :desc) }

  def configuration_hash
    (configuration || {}).to_h
  end

  # Time of day new jobs from this template should start, e.g. "08:00".
  def schedule_start_time
    configuration_hash["schedule_start_time"].presence || "08:00"
  end

  def working_days
    Array(configuration_hash["standard_work_days"]).map(&:to_i).select { |d| d.between?(1, 7) }.presence || [1, 2, 3, 4, 5]
  end

  def duration_days
    value = configuration_hash["days"].to_i
    value.positive? ? value : 1
  end

  def record_use!
    update_columns(use_count: use_count.to_i + 1, last_used_at: Time.current, updated_at: Time.current)
  end

  private

  def normalize_name
    self.name = name.to_s.strip
  end

  def sync_denormalized_columns
    self.trade_type = configuration_hash["trade_type"].presence
    self.skill_class = configuration_hash["skill_class"].presence
  end

  def configuration_is_a_hash
    return if configuration.is_a?(Hash)

    errors.add(:configuration, "must be an object")
  end
end
