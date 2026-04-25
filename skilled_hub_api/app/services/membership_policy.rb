# frozen_string_literal: true

class MembershipPolicy
  CACHE_EXPIRY = 5.minutes

  def self.invalidate_cache!
    %w[technician company].each { |aud| Rails.cache.delete(cache_key_for(aud)) }
  end

  def self.rules_for_audience(audience)
    aud = normalize_audience(audience)
    Rails.cache.fetch(cache_key_for(aud), expires_in: CACHE_EXPIRY) { build_rules(aud) }
  end

  def self.slugs_for_audience(audience)
    rules_for_audience(audience).keys
  end

  def self.level_valid?(value, audience:)
    slugs_for_audience(audience).include?(value.to_s)
  end

  def self.normalized_level(value, audience:)
    level = value.to_s.downcase
    aud = normalize_audience(audience)
    return level if level_valid?(level, audience: aud)

    default_slug_for(aud)
  end

  def self.default_slug_for(audience)
    rules_for_audience(audience).keys.first || "basic"
  end

  def self.company_monthly_fee_cents(company_profile)
    rule = rule_for(:company, company_profile&.membership_level)
    effective_monthly_fee_cents(profile: company_profile, base_fee_cents: rule[:fee_cents])
  end

  def self.technician_monthly_fee_cents(technician_profile)
    rule = rule_for(:technician, technician_profile&.membership_level)
    effective_monthly_fee_cents(profile: technician_profile, base_fee_cents: rule[:fee_cents])
  end

  def self.company_commission_percent(company_profile)
    rule = rule_for(:company, company_profile&.membership_level)
    effective_commission_percent(profile: company_profile, base_commission_percent: rule[:commission_percent])
  end

  def self.technician_commission_percent(technician_profile)
    rule = rule_for(:technician, technician_profile&.membership_level)
    effective_commission_percent(profile: technician_profile, base_commission_percent: rule[:commission_percent])
  end

  # A single admin toggle to keep tier benefits while exempting billing.
  def self.billing_exempt?(profile)
    profile&.membership_fee_waived?
  end

  def self.job_visible_to_technician?(job:, technician_profile:)
    return true if technician_profile.blank?

    rule = rule_for(:technician, technician_profile.membership_level)
    return false unless technician_experience_eligible?(job: job, technician_profile: technician_profile, rule: rule)

    delay_hours = rule[:early_access_delay_hours].to_i
    anchor_time = job.go_live_at || job.created_at
    return false if anchor_time.blank?

    visible_from = anchor_time - delay_hours.hours
    Time.current >= visible_from
  end

  def self.normalize_audience(audience)
    audience.to_s == "company" ? "company" : "technician"
  end

  def self.cache_key_for(audience)
    "membership_policy/rules/#{normalize_audience(audience)}"
  end

  def self.build_rules(audience)
    aud = normalize_audience(audience)
    return legacy_rules_for(aud) unless MembershipTierConfig.table_exists?

    rules = MembershipTierConfig.for_audience(aud).each_with_object({}) do |config, h|
      h[config.slug] = config.rules_hash
    end
    rules.presence || legacy_rules_for(aud)
  rescue ActiveRecord::StatementInvalid
    legacy_rules_for(aud)
  end

  def self.rule_for(audience, membership_level)
    rules = rules_for_audience(audience)
    slug = normalized_level(membership_level, audience: audience)
    rules.fetch(slug) do
      rules.fetch(default_slug_for(audience)) { { fee_cents: 0, commission_percent: 0.0, early_access_delay_hours: 0 } }
    end
  end

  def self.effective_monthly_fee_cents(profile:, base_fee_cents:)
    return 0 if profile&.membership_fee_waived?

    override = profile&.membership_fee_override_cents
    return base_fee_cents if override.nil?

    [override.to_i, 0].max
  end

  def self.effective_commission_percent(profile:, base_commission_percent:)
    return 0.0 if billing_exempt?(profile)

    override = profile&.commission_override_percent
    return base_commission_percent if override.nil?

    value = override.to_f
    return 0.0 if value.negative?

    value
  end

  def self.legacy_rules_for(audience)
    aud = normalize_audience(audience)
    if aud == "company"
      {
        "basic" => { fee_cents: 0, commission_percent: 20.0, early_access_delay_hours: 0 },
        "pro" => { fee_cents: 9900, commission_percent: 15.0, early_access_delay_hours: 0 },
        "premium" => { fee_cents: 24_900, commission_percent: 10.0, early_access_delay_hours: 0 }
      }
    else
      {
        "basic" => { fee_cents: 0, commission_percent: 20.0, early_access_delay_hours: 0 },
        "pro" => { fee_cents: 4900, commission_percent: 20.0, early_access_delay_hours: 24, job_access_min_experience_years: 0 },
        "premium" => { fee_cents: 24_900, commission_percent: 10.0, early_access_delay_hours: 0, job_access_min_experience_years: 0 }
      }
    end
  end

  def self.technician_experience_eligible?(job:, technician_profile:, rule:)
    tech_years = technician_profile.experience_years.to_i
    job_required_years = job.minimum_years_experience.to_i
    tier_required_years = rule[:job_access_min_experience_years].to_i
    minimum_required = [job_required_years, tier_required_years].max
    tech_years >= minimum_required
  end
end
