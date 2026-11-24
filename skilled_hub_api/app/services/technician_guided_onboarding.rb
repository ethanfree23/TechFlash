# frozen_string_literal: true

# Feature flag + gate for the technician guided onboarding wizard.
# Disabled by default; enable via PlatformSetting key technician_guided_onboarding.
class TechnicianGuidedOnboarding
  SETTING_KEY = "technician_guided_onboarding"
  DEFAULTS = {
    "enabled" => false,
    "assessment_reminder_days" => 3
  }.freeze

  class << self
    def settings
      raw = PlatformSetting.find_by(key: SETTING_KEY)&.value_json
      merged = DEFAULTS.merge(raw.is_a?(Hash) ? raw.stringify_keys : {})
      merged["enabled"] = ActiveModel::Type::Boolean.new.cast(merged["enabled"])
      merged["assessment_reminder_days"] = merged["assessment_reminder_days"].to_i
      merged["assessment_reminder_days"] = 3 if merged["assessment_reminder_days"] <= 0
      merged
    end

    def enabled?
      settings["enabled"] == true
    end

    def update_settings!(attrs)
      cleaned = settings.merge(attrs.stringify_keys)
      cleaned["enabled"] = ActiveModel::Type::Boolean.new.cast(cleaned["enabled"])
      cleaned["assessment_reminder_days"] = cleaned["assessment_reminder_days"].to_i
      cleaned["assessment_reminder_days"] = 3 if cleaned["assessment_reminder_days"] <= 0
      record = PlatformSetting.find_or_initialize_by(key: SETTING_KEY)
      record.value_json = cleaned
      record.save!
      cleaned
    end

    def required_for?(user)
      return false unless enabled?
      return false unless user&.technician?
      return false if user.admin? || user.company?

      state = TechnicianOnboardingProgress.for(user)
      state[:required] == true
    end
  end
end
