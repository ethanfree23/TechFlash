# frozen_string_literal: true

# Derives guided-onboarding section statuses from live account data and
# TechnicianOnboarding progress. Does not invent parallel verification/billing state.
class TechnicianOnboardingProgress
  SECTIONS = %w[profile verification notifications billing membership].freeze

  def self.for(user)
    new(user).to_h
  end

  def self.summary_for(user)
    payload = self.for(user)
    {
      status: payload[:status],
      required: payload[:required],
      percent: payload[:percent],
      current_section: payload[:current_section],
      current_substep: payload[:current_substep],
      completed_at: payload[:completed_at],
      last_activity_at: payload[:last_activity_at],
      grandfathered: payload[:grandfathered],
      sections_complete: payload[:sections]&.count { |_, v| v[:technician_complete] },
      sections_total: SECTIONS.size
    }
  end

  def initialize(user)
    @user = user
    @profile = user&.technician_profile
    @record = user&.technician? ? TechnicianOnboarding.ensure_for!(user) : nil
  end

  def to_h
    return empty_payload unless @user&.technician? && @profile && @record

    inventory = TechnicianVerificationInventory.call(@user)
    sections = {
      profile: profile_section,
      verification: verification_section(inventory),
      notifications: notifications_section,
      billing: billing_section,
      membership: membership_section
    }

    technician_complete = sections.values.all? { |s| s[:technician_complete] }
    percent = ((sections.values.count { |s| s[:technician_complete] }.to_f / SECTIONS.size) * 100).round

    required = compute_required?
    {
      status: @record.status,
      required: required,
      feature_enabled: TechnicianGuidedOnboarding.enabled?,
      percent: percent,
      can_complete: technician_complete,
      current_section: @record.current_section.presence || "welcome",
      current_substep: @record.current_substep,
      completed_sections: Array(@record.completed_sections),
      started_at: @record.started_at&.iso8601,
      completed_at: @record.completed_at&.iso8601,
      last_activity_at: @record.last_activity_at&.iso8601,
      grandfathered: @record.grandfathered_at.present?,
      grandfather_reason: @record.grandfather_reason,
      required_by_admin_at: @record.required_by_admin_at&.iso8601,
      welcome_banner_dismissed: @record.welcome_banner_dismissed,
      assessment_prompt_sent_at: @record.assessment_prompt_sent_at&.iso8601,
      onboarding_version: @record.onboarding_version,
      sections: sections,
      user: user_snapshot,
      assessments: assessment_snapshot
    }
  end

  private

  def empty_payload
    {
      status: "not_applicable",
      required: false,
      feature_enabled: TechnicianGuidedOnboarding.enabled?,
      percent: 0,
      can_complete: false,
      sections: {}
    }
  end

  def compute_required?
    return false unless TechnicianGuidedOnboarding.enabled?
    return true if @record.required_by_admin_at.present?
    return false if @record.completed?

    true
  end

  def user_snapshot
    {
      id: @user.id,
      first_name: @user.first_name,
      last_name: @user.last_name,
      email: @user.email,
      phone: @user.phone.presence || @profile.phone,
      trade_type: @profile.trade_type,
      skill_class: @profile.skill_class,
      experience_years: @profile.experience_years,
      membership_level: MembershipPolicy.normalized_level(@profile.membership_level, audience: :technician)
    }
  end

  def assessment_snapshot
    available = Assessments::TechnicianCatalog.offered_to?(@profile)
    entries = available ? Assessments::TechnicianCatalog.call(technician_profile: @profile) : []
    incomplete = entries.select { |entry| entry.state != Assessments::TechnicianCatalog::STATE_COMPLETED }

    {
      available: available,
      incomplete_count: incomplete.size,
      incomplete_slugs: incomplete.map { |entry| entry.assessment.slug },
      results_count: @profile.technician_assessment_results.count
    }
  rescue StandardError => e
    Rails.logger.warn("TechnicianOnboardingProgress assessments: #{e.class} #{e.message}")
    { available: false, incomplete_count: 0, incomplete_slugs: [], results_count: 0 }
  end

  def profile_section
    missing = []
    missing << "first_name" if @user.first_name.blank?
    missing << "last_name" if @user.last_name.blank?
    missing << "phone" if @user.phone.blank? && @profile.phone.blank?
    missing << "trade_type" if @profile.trade_type.blank?
    missing << "skill_class" if @profile.skill_class.blank?
    missing << "location" if @profile.city.blank? && @profile.location.blank? && @profile.zip_code.blank?
    missing << "availability" if @profile.availability.blank?

    optional_missing = []
    optional_missing << "avatar" unless @profile.avatar.attached?
    optional_missing << "bio" if @profile.bio.blank?
    optional_missing << "experience_years" if @profile.experience_years.blank?

    {
      key: "profile",
      label: "Your Profile",
      technician_complete: missing.empty?,
      status: missing.empty? ? (optional_missing.empty? ? "complete" : "complete_with_optional") : "action_required",
      missing: missing,
      optional_missing: optional_missing,
      reviewed: section_reviewed?("profile")
    }
  end

  def verification_section(inventory)
    refs = inventory&.dig(:professional_references) || {}
    trade = inventory&.dig(:trade_license) || {}
    background = inventory&.dig(:background_check) || {}

    refs_done = refs[:complete] == true || refs[:count].to_i >= TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT
    # License: required only when technician claims a credential or already uploaded one.
    license_required = @profile.has_trade_credential == true || Array(trade[:documents]).any?
    license_done = !license_required || trade[:complete] == true || trade[:state].to_s == "yes" ||
                   Array(trade[:documents]).any? { |d| d.is_a?(Hash) && (d[:complete] || d["complete"]) }

    bg_action_done =
      @profile.background_verified ||
      background[:complete] == true ||
      %w[passed clear].include?(background[:color_bucket].to_s) ||
      %w[clear completed].include?(background[:state].to_s) ||
      invitation_or_processing?(background)

    missing = []
    missing << "references" unless refs_done
    missing << "trade_license" unless license_done
    missing << "background_check" unless bg_action_done

    external_pending = bg_action_done && !(@profile.background_verified || background[:complete] == true ||
      %w[passed clear].include?(background[:color_bucket].to_s))

    status =
      if missing.any?
        "action_required"
      elsif external_pending || inventory&.dig(:pending)
        "pending_review"
      else
        "complete"
      end

    {
      key: "verification",
      label: "Verification",
      technician_complete: missing.empty?,
      status: status,
      missing: missing,
      external_pending: !!external_pending,
      license_required: license_required,
      references: {
        count: refs[:count].to_i,
        required: TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT,
        complete: refs_done
      },
      background: {
        label: background[:label] || background[:status] || background[:color_bucket],
        state: background[:state],
        color_bucket: background[:color_bucket],
        verified: !!@profile.background_verified
      },
      reviewed: section_reviewed?("verification")
    }
  end

  def invitation_or_processing?(background)
    state = background[:state].to_s
    status = background[:status].to_s.downcase
    color = background[:color_bucket].to_s
    return true if %w[invited invitation_sent pending processing in_progress awaiting_candidate action_required].include?(state)
    return true if status.include?("pending") || status.include?("process") || status.include?("invit")
    return true if %w[pending processing invited].include?(color)
    return true if background[:invitation_url].present? || background[:candidate_id].present?

    false
  end

  def notifications_section
    # Visiting/confirming notifications is sufficient; declining optional channels is OK.
    reviewed = section_reviewed?("notifications")
    {
      key: "notifications",
      label: "Notifications",
      technician_complete: reviewed,
      status: reviewed ? "complete" : "action_required",
      missing: reviewed ? [] : ["confirm_preferences"],
      preferences: {
        email_notifications_enabled: @user.email_notifications_enabled?,
        job_alert_notifications_enabled: @user.job_alert_notifications_enabled != false,
        email_notification_preferences: @user.email_notification_preferences_hash,
        job_alert_preference: job_alert_snapshot
      },
      reviewed: reviewed
    }
  end

  def billing_section
    payout_ready = @profile.stripe_account_id.present? &&
                   (@profile.stripe_payouts_enabled || @profile.stripe_details_submitted)
    started = @profile.stripe_account_id.present?
    # Technician action: start Connect setup. External Stripe review does not block completion.
    reviewed = section_reviewed?("billing")
    technician_complete = payout_ready || (started && reviewed) || reviewed

    status =
      if payout_ready
        "complete"
      elsif started
        "pending_external"
      elsif reviewed
        "acknowledged"
      else
        "action_required"
      end

    {
      key: "billing",
      label: "Billing & Payments",
      technician_complete: technician_complete,
      status: status,
      missing: technician_complete ? [] : ["payout_setup"],
      payout: {
        stripe_account_id: @profile.stripe_account_id,
        payout_ready: payout_ready,
        charges_enabled: @profile.stripe_charges_enabled,
        payouts_enabled: @profile.stripe_payouts_enabled,
        details_submitted: @profile.stripe_details_submitted,
        requirements_due: @profile.stripe_connect_requirements_due
      },
      reviewed: reviewed
    }
  end

  def membership_section
    level = MembershipPolicy.normalized_level(@profile.membership_level, audience: :technician)
    reviewed = section_reviewed?("membership")
    # Default/basic (or any assigned tier) counts once the technician has confirmed the section.
    technician_complete = level.present? && reviewed

    {
      key: "membership",
      label: "Membership & Job Access",
      technician_complete: technician_complete,
      status: technician_complete ? "complete" : "action_required",
      missing: technician_complete ? [] : ["confirm_membership"],
      membership: {
        level: level,
        status: @profile.membership_status,
        fee_waived: @profile.membership_fee_waived,
        has_subscription: @profile.stripe_membership_subscription_id.present?,
        current_period_end_at: @profile.membership_current_period_end_at&.iso8601,
        monthly_fee_cents: MembershipPolicy.technician_monthly_fee_cents(@profile),
        commission_percent: MembershipPolicy.technician_commission_percent(@profile)
      },
      reviewed: reviewed
    }
  end

  def section_reviewed?(key)
    Array(@record.completed_sections).map(&:to_s).include?(key.to_s) ||
      ActiveModel::Type::Boolean.new.cast(@record.section_statuses.dig(key.to_s, "reviewed"))
  end

  def job_alert_snapshot
    pref = @user.job_alert_preference
    return nil unless pref

    {
      trade_label: pref.trade_label,
      min_hourly_rate_cents: pref.min_hourly_rate_cents,
      max_distance_miles: pref.max_distance_miles,
      email_enabled: pref.email_enabled,
      sms_enabled: pref.sms_enabled,
      app_enabled: pref.app_enabled
    }
  end
end
