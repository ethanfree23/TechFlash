# frozen_string_literal: true

class MembershipPolicy
  MissingTierConfigError = Class.new(StandardError)
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
    rules_for_audience(audience).keys.first
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
    return false unless technician_trade_match?(job: job, technician_profile: technician_profile)

    rule = rule_for(:technician, technician_profile.membership_level)
    experience_eligible = technician_experience_eligible?(job: job, technician_profile: technician_profile, rule: rule)
    additional_eligible =
      if demo_mode?
        true
      else
        technician_additional_access_eligible?(technician_profile: technician_profile, rule: rule)
      end
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

  # SQL-first visibility filter — avoids loading thousands of jobs into Ruby for membership checks.
  def self.apply_technician_visibility_scope(jobs, technician_profile)
    return jobs if technician_profile.blank?

    rule = rule_for(:technician, technician_profile.membership_level)
    unless demo_mode?
      return jobs.none unless technician_additional_access_eligible?(technician_profile: technician_profile, rule: rule)
    end

    tier_min = rule[:job_access_min_experience_years].to_i
    tech_years = technician_profile.experience_years.to_i
    return jobs.none if tech_years < tier_min

    trade_labels = technician_trade_labels(technician_profile)
    return jobs.none if trade_labels.blank?

    scoped = jobs
      .where("COALESCE(jobs.minimum_years_experience, 0) <= ?", tech_years)
      .where(
        "COALESCE(jobs.trade_type, jobs.skill_class, '') = '' OR LOWER(COALESCE(jobs.trade_type, jobs.skill_class, '')) IN (?)",
        trade_labels.map(&:downcase)
      )

    delay_hours = rule[:early_access_delay_hours].to_i
    visible_cutoff = Time.current - delay_hours.hours
    scoped.where("COALESCE(jobs.go_live_at, jobs.created_at) <= ?", visible_cutoff)
  end

  def self.normalize_audience(audience)
    audience.to_s == "company" ? "company" : "technician"
  end

  def self.cache_key_for(audience)
    "membership_policy/rules/#{normalize_audience(audience)}"
  end

  def self.build_rules(audience)
    aud = normalize_audience(audience)
    unless MembershipTierConfig.table_exists?
      raise MissingTierConfigError, "membership_tier_configs table is missing for #{aud}"
    end

    rules = MembershipTierConfig.for_audience(aud).each_with_object({}) do |config, h|
      h[config.slug] = config.rules_hash
    end
    if rules.blank?
      raise MissingTierConfigError, "no membership tier configs found for audience=#{aud}"
    end

    rules
  rescue ActiveRecord::StatementInvalid, ActiveRecord::UnknownAttributeError => e
    raise MissingTierConfigError, "unable to load membership tier configs for #{aud}: #{e.class}: #{e.message}"
  end

  def self.rule_for(audience, membership_level)
    rules = rules_for_audience(audience)
    slug = normalized_level(membership_level, audience: audience)
    rules.fetch(slug) { rules.fetch(default_slug_for(audience)) }
  end

  def self.effective_monthly_fee_cents(profile:, base_fee_cents:)
    return 0 if profile&.membership_fee_waived?

    override = profile&.membership_fee_override_cents
    effective_base = override.nil? ? base_fee_cents : [override.to_i, 0].max

    CouponApplicationService.apply_fee_discount(base_fee_cents: effective_base, user: profile&.user)
  end

  def self.effective_commission_percent(profile:, base_commission_percent:)
    override = profile&.commission_override_percent
    value = override.nil? ? base_commission_percent.to_f : override.to_f
    return 0.0 if value.negative?

    CouponApplicationService.apply_commission_discount(base_commission_percent: value, user: profile&.user)
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

  def self.technician_trade_labels(technician_profile)
    values = [technician_profile.trade_type] + Array(technician_profile.specialties)
    values
      .map do |label|
        normalized = TradeCatalog.normalized_label(label)
        normalized.presence || label.to_s.strip.presence
      end
      .compact
      .uniq
  end

  def self.technician_trade_match?(job:, technician_profile:)
    job_trade = TradeCatalog.normalized_label(job.trade_type) || TradeCatalog.normalized_label(job.skill_class)
    return true if job_trade.blank?

    technician_trade_labels(technician_profile).include?(job_trade)
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

  def self.demo_mode?
    defined?(DemoMode) && DemoMode.enabled?
  end
end
