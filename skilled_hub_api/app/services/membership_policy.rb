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
    experience_eligible = technician_experience_eligible?(job: job, technician_profile: technician_profile, rule: rule)
    additional_eligible = technician_additional_access_eligible?(technician_profile: technician_profile, rule: rule)
    unless experience_eligible && additional_eligible
      # #region agent log
      debug_log(
        hypothesis_id: 'B5',
        location: 'membership_policy.rb:job_visible_to_technician?:eligibility',
        message: 'membership eligibility rejected',
        data: {
          job_id: job&.id,
          technician_profile_id: technician_profile&.id,
          membership_level: technician_profile&.membership_level.to_s,
          experience_eligible: experience_eligible,
          additional_eligible: additional_eligible,
          job_minimum_years_experience: job&.minimum_years_experience,
          technician_experience_years: technician_profile&.experience_years
        }
      )
      # #endregion
      return false
    end

    delay_hours = rule[:early_access_delay_hours].to_i
    anchor_time = job.go_live_at || job.created_at
    if anchor_time.blank?
      # #region agent log
      debug_log(
        hypothesis_id: 'B6',
        location: 'membership_policy.rb:job_visible_to_technician?:anchor_time',
        message: 'membership rejected due blank anchor',
        data: {
          job_id: job&.id,
          technician_profile_id: technician_profile&.id,
          go_live_at: job&.go_live_at,
          created_at: job&.created_at
        }
      )
      # #endregion
      return false
    end

    visible_from = anchor_time + delay_hours.hours
    visible = Time.current >= visible_from
    # #region agent log
    debug_log(
      hypothesis_id: 'B7',
      location: 'membership_policy.rb:job_visible_to_technician?:time_window',
      message: 'membership time window check',
      data: {
        job_id: job&.id,
        technician_profile_id: technician_profile&.id,
        membership_level: technician_profile&.membership_level.to_s,
        delay_hours: delay_hours,
        anchor_time: anchor_time,
        visible_from: visible_from,
        now: Time.current,
        visible: visible
      }
    )
    # #endregion
    visible
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
    effective_base = override.nil? ? base_fee_cents : [override.to_i, 0].max

    CouponApplicationService.apply_fee_discount(base_fee_cents: effective_base, user: profile&.user)
  end

  def self.effective_commission_percent(profile:, base_commission_percent:)
    return 0.0 if billing_exempt?(profile)

    override = profile&.commission_override_percent
    value = override.nil? ? base_commission_percent.to_f : override.to_f
    return 0.0 if value.negative?

    CouponApplicationService.apply_commission_discount(base_commission_percent: value, user: profile&.user)
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
        "pro" => { fee_cents: 4900, commission_percent: 20.0, early_access_delay_hours: 24, job_access_min_experience_years: 0, job_access_min_jobs_completed: 0, job_access_min_successful_jobs: 0, job_access_min_profile_completeness_percent: 0, job_access_requires_verified_background: false },
        "premium" => { fee_cents: 24_900, commission_percent: 10.0, early_access_delay_hours: 0, job_access_min_experience_years: 0, job_access_min_jobs_completed: 0, job_access_min_successful_jobs: 0, job_access_min_profile_completeness_percent: 0, job_access_requires_verified_background: false }
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

  def self.technician_additional_access_eligible?(technician_profile:, rule:)
    minimum_jobs_completed = rule[:job_access_min_jobs_completed].to_i
    minimum_successful_jobs = rule[:job_access_min_successful_jobs].to_i
    minimum_profile_completeness = rule[:job_access_min_profile_completeness_percent].to_i
    requires_verified_background = !!rule[:job_access_requires_verified_background]

    return false if technician_completed_jobs_count(technician_profile) < minimum_jobs_completed
    return false if technician_successful_jobs_count(technician_profile) < minimum_successful_jobs
    return false if technician_profile_completeness_percent(technician_profile) < minimum_profile_completeness
    return false if requires_verified_background && !technician_background_verified?(technician_profile)

    true
  end

  def self.technician_completed_jobs_count(technician_profile)
    JobApplication
      .joins(:job)
      .where(technician_profile_id: technician_profile.id, status: JobApplication.statuses[:accepted], jobs: { status: [Job.statuses[:completed], Job.statuses[:finished]] })
      .count
  end

  def self.technician_successful_jobs_count(technician_profile)
    JobApplication
      .joins(:job)
      .where(technician_profile_id: technician_profile.id, status: JobApplication.statuses[:accepted], jobs: { status: Job.statuses[:finished] })
      .count
  end

  def self.technician_profile_completeness_percent(technician_profile)
    # City OR legacy location counts once toward "service area" so admin-created profiles
    # with only a location string still satisfy tier gates that use completeness.
    service_area =
      technician_profile.city.presence || technician_profile.location.presence
    fields = [
      technician_profile.trade_type,
      technician_profile.availability,
      technician_profile.bio,
      technician_profile.phone,
      service_area
    ]
    present_count = fields.count { |value| value.present? }
    ((present_count.to_f / fields.length) * 100).floor
  end

  def self.technician_background_verified?(technician_profile)
    !!technician_profile.background_verified
  end

  def self.debug_log(hypothesis_id:, location:, message:, data:)
    File.open(Rails.root.join('..', 'debug-f0f940.log'), 'a') do |f|
      f.puts({
        sessionId: 'f0f940',
        runId: 'initial',
        hypothesisId: hypothesis_id,
        location: location,
        message: message,
        data: data,
        timestamp: (Time.now.to_f * 1000).to_i
      }.to_json)
    end
  rescue StandardError
    nil
  end
end
