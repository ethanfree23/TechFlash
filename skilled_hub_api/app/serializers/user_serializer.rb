class UserSerializer < ActiveModel::Serializer
  attributes :id,
             :email,
             :first_name,
             :last_name,
             :phone,
             :role,
             :company_profile_id,
             :membership_level,
             :skills_assessments_available,
             :email_notifications_enabled,
             :email_notification_preferences,
             :job_alert_notifications_enabled,
             :job_alert_preference,
             :ui_preferences,
             :guided_onboarding,
             :created_at,
             :updated_at

  def company_profile_id
    object.company_profile&.id
  end

  # Technician nav gate: hide Assessments when no plumbing/electrical/HVAC
  # (or other trade-matched) assessment applies to this profile.
  def skills_assessments_available
    return false unless object.technician?

    Assessments::TechnicianCatalog.offered_to?(object.technician_profile)
  end

  def membership_level
    if object.company?
      MembershipPolicy.normalized_level(object.company_profile&.membership_level, audience: :company)
    elsif object.technician?
      MembershipPolicy.normalized_level(object.technician_profile&.membership_level, audience: :technician)
    end
  end

  def email_notification_preferences
    object.email_notification_preferences_hash
  end

  def ui_preferences
    object.ui_preferences_hash
  end

  def job_alert_preference
    pref = object.job_alert_preference
    return nil if pref.blank?

    {
      trade_label: pref.trade_label,
      min_hourly_rate_cents: pref.min_hourly_rate_cents,
      max_distance_miles: pref.max_distance_miles,
      min_duration_weeks: pref.min_duration_weeks,
      max_duration_weeks: pref.max_duration_weeks,
      email_enabled: pref.email_enabled,
      sms_enabled: pref.sms_enabled,
      app_enabled: pref.app_enabled
    }
  end

  # Lightweight gate payload for post-login redirects. Full section detail lives
  # on GET /api/v1/technician_onboarding.
  def guided_onboarding
    return { applicable: false, required: false, feature_enabled: TechnicianGuidedOnboarding.enabled? } unless object.technician?

    summary = TechnicianOnboardingProgress.summary_for(object)
    summary.merge(applicable: true, feature_enabled: TechnicianGuidedOnboarding.enabled?)
  rescue StandardError => e
    Rails.logger.warn("UserSerializer#guided_onboarding: #{e.class} #{e.message}")
    { applicable: true, required: false, feature_enabled: TechnicianGuidedOnboarding.enabled?, error: true }
  end
end 