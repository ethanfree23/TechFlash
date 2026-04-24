# frozen_string_literal: true

class MembershipPolicy
  LEVELS = %w[basic pro premium].freeze

  TECH_RULES = {
    "basic" => { fee_cents: 0, commission_percent: 20, early_access_delay_hours: 48 },
    "pro" => { fee_cents: 4_900, commission_percent: 20, early_access_delay_hours: 24 },
    "premium" => { fee_cents: 24_900, commission_percent: 10, early_access_delay_hours: 0 }
  }.freeze

  COMPANY_RULES = {
    "basic" => { fee_cents: 0, commission_percent: 10 },
    "pro" => { fee_cents: 25_000, commission_percent: 5 },
    "premium" => { fee_cents: 100_000, commission_percent: 0 }
  }.freeze

  def self.level_valid?(value)
    LEVELS.include?(value.to_s)
  end

  def self.normalized_level(value)
    level = value.to_s.downcase
    level_valid?(level) ? level : "basic"
  end

  def self.company_monthly_fee_cents(company_profile)
    rule = COMPANY_RULES.fetch(normalized_level(company_profile&.membership_level))
    effective_monthly_fee_cents(profile: company_profile, base_fee_cents: rule[:fee_cents])
  end

  def self.technician_monthly_fee_cents(technician_profile)
    rule = TECH_RULES.fetch(normalized_level(technician_profile&.membership_level))
    effective_monthly_fee_cents(profile: technician_profile, base_fee_cents: rule[:fee_cents])
  end

  def self.company_commission_percent(company_profile)
    rule = COMPANY_RULES.fetch(normalized_level(company_profile&.membership_level))
    effective_commission_percent(profile: company_profile, base_commission_percent: rule[:commission_percent])
  end

  def self.technician_commission_percent(technician_profile)
    rule = TECH_RULES.fetch(normalized_level(technician_profile&.membership_level))
    effective_commission_percent(profile: technician_profile, base_commission_percent: rule[:commission_percent])
  end

  def self.job_visible_to_technician?(job:, technician_profile:)
    return true if technician_profile.blank?
    rule = TECH_RULES.fetch(normalized_level(technician_profile.membership_level))
    delay_hours = rule[:early_access_delay_hours].to_i
    return true if delay_hours <= 0
    return false if job.created_at.blank?

    job.created_at <= delay_hours.hours.ago
  end

  private_class_method def self.effective_monthly_fee_cents(profile:, base_fee_cents:)
    return 0 if profile&.membership_fee_waived?
    override = profile&.membership_fee_override_cents
    return base_fee_cents if override.nil?

    [override.to_i, 0].max
  end

  private_class_method def self.effective_commission_percent(profile:, base_commission_percent:)
    override = profile&.commission_override_percent
    return base_commission_percent if override.nil?

    value = override.to_f
    return 0.0 if value.negative?

    value
  end
end
