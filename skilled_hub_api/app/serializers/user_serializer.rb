class UserSerializer < ActiveModel::Serializer
  attributes :id,
             :email,
             :first_name,
             :last_name,
             :phone,
             :role,
             :company_profile_id,
             :membership_level,
             :email_notifications_enabled,
             :email_notification_preferences,
             :job_alert_notifications_enabled,
             :job_alert_preference,
             :ui_preferences,
             :created_at,
             :updated_at

  def company_profile_id
    object.company_profile&.id
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
      max_duration_days: pref.max_duration_days,
      email_enabled: pref.email_enabled,
      sms_enabled: pref.sms_enabled,
      app_enabled: pref.app_enabled
    }
  end
end 