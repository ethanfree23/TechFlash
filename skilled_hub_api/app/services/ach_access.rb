# frozen_string_literal: true

# Admin-controlled ACH (us_bank_account) feature flag.
#
# Effective rule for NEW ACH initiation only:
#   ENV ACH_GLOBAL_DISABLED is not true
#   AND global PlatformSetting enabled
#   AND company.ach_payments_enabled
#
# GA semantics (company column default true):
#   - New / existing non-blocked companies: company flag true by default.
#   - Explicit admin block: set_company!(false) writes AchFeatureAudit; stays blocked.
#   - Availability ≠ authorization: allowed? never charges, creates a mandate, or
#     bypasses bank verification / user consent.
# Pilot mode (PlatformSetting "ach_pilot_mode", audited via AchFeatureAudit scope "pilot"):
#   - Global OFF or ENV kill ON          => all new ACH initiation denied.
#   - Global ON + pilot ON               => ONLY companies in the pilot allow-list (and not
#                                           admin-blocked) are permitted. Empty / invalid
#                                           allow-list => nobody (fail closed).
#   - Global ON + pilot OFF              => all companies except explicit admin blocks.
# Fail CLOSED: missing company, absent global setting, or any lookup error => disabled.
# Never gates webhooks, refunds, disputes, returns, reconcile, admin views,
# already-processing ACH PaymentIntents, card payments, or technician payouts.
class AchAccess
  class DisabledError < StandardError
    attr_reader :code

    def initialize(message = USER_SAFE_MESSAGE, code: "ach_disabled")
      super(message)
      @code = code
    end
  end

  USER_SAFE_MESSAGE =
    "Bank account (ACH) payments are not enabled for this company. Use a card, or ask an administrator to enable ACH.".freeze

  GLOBAL_SETTING_KEY = "ach_payments_globally_enabled".freeze
  PILOT_SETTING_KEY = "ach_pilot_mode".freeze
  PILOT_USER_SAFE_MESSAGE =
    "Bank account (ACH) payments are currently limited to a controlled pilot. Use a card, or ask an administrator.".freeze

  class << self
    def env_kill_switch?
      ENV["ACH_GLOBAL_DISABLED"].to_s.strip.casecmp("true").zero?
    end

    # DB value only (ignores ENV kill). Absent setting => false (fail closed).
    def global_enabled_without_env_kill
      raw = PlatformSetting.find_by(key: GLOBAL_SETTING_KEY)&.value_json
      return false if raw.nil?

      case raw
      when Hash
        ActiveModel::Type::Boolean.new.cast(raw["enabled"] || raw[:enabled]) == true
      when TrueClass
        true
      else
        false
      end
    rescue StandardError
      false
    end

    def global_enabled?
      return false if env_kill_switch?

      global_enabled_without_env_kill
    rescue StandardError
      false
    end

    def company_enabled?(company_profile)
      return false if company_profile.blank?
      return false unless company_profile.respond_to?(:ach_payments_enabled)

      company_profile.ach_payments_enabled == true
    rescue StandardError
      false
    end

    # Raw pilot setting. Absent => { enabled: false, company_profile_ids: [] }.
    def pilot_setting
      raw = PlatformSetting.find_by(key: PILOT_SETTING_KEY)&.value_json
      raw = {} unless raw.is_a?(Hash)
      enabled = ActiveModel::Type::Boolean.new.cast(raw["enabled"] || raw[:enabled]) == true
      ids = Array(raw["company_profile_ids"] || raw[:company_profile_ids])
              .map { |v| Integer(v.to_s, 10) rescue nil }.compact.select(&:positive?).uniq.sort
      { enabled: enabled, company_profile_ids: ids }
    rescue StandardError
      { enabled: true, company_profile_ids: [] } # unreadable setting => behave as a closed pilot
    end

    def pilot_mode_enabled?
      pilot_setting[:enabled] == true
    rescue StandardError
      true
    end

    # Companies actually permitted under the pilot: configured ids that still exist.
    # Non-existent ids are dropped; an empty result denies every company (fail closed).
    def pilot_company_ids
      ids = pilot_setting[:company_profile_ids]
      return [] if ids.empty?

      CompanyProfile.where(id: ids).pluck(:id).sort
    rescue StandardError
      []
    end

    # True when pilot mode is ON but has no valid company => nobody may initiate ACH.
    def pilot_misconfigured?
      pilot_mode_enabled? && pilot_company_ids.empty?
    rescue StandardError
      true
    end

    def pilot_permits?(company_profile)
      return true unless pilot_mode_enabled?
      return false if company_profile.blank? || company_profile.id.blank?

      pilot_company_ids.include?(company_profile.id)
    rescue StandardError
      false
    end

    # Single authorization decision for every NEW ACH initiation route
    # (bank linking / SetupIntent, saved-method selection, job funding, top-ups, smoke test).
    def allowed?(company_profile)
      global_enabled? && company_enabled?(company_profile) && pilot_permits?(company_profile)
    rescue StandardError
      false
    end

    def denial_reason(company_profile)
      return :env_kill_switch if env_kill_switch?
      return :global_disabled unless global_enabled_without_env_kill
      return :company_blocked unless company_enabled?(company_profile)
      return :pilot_restricted unless pilot_permits?(company_profile)

      nil
    rescue StandardError
      :lookup_error
    end

    def assert_allowed!(company_profile)
      return true if allowed?(company_profile)

      reason = denial_reason(company_profile)
      if reason == :pilot_restricted
        raise DisabledError.new(PILOT_USER_SAFE_MESSAGE, code: "ach_pilot_restricted")
      end

      raise DisabledError, USER_SAFE_MESSAGE
    end

    def status_for(company_profile)
      {
        ach_payments_enabled: allowed?(company_profile),
        company_ach_payments_enabled: company_enabled?(company_profile),
        global_ach_payments_enabled: global_enabled?,
        ach_global_disabled_env: env_kill_switch?,
        ach_pilot_mode_enabled: pilot_mode_enabled?,
        ach_pilot_permits_company: pilot_permits?(company_profile)
      }
    rescue StandardError
      {
        ach_payments_enabled: false,
        company_ach_payments_enabled: false,
        global_ach_payments_enabled: false,
        ach_global_disabled_env: env_kill_switch?,
        ach_pilot_mode_enabled: true,
        ach_pilot_permits_company: false
      }
    end

    def pilot_status
      setting = pilot_setting
      valid_ids = pilot_company_ids
      {
        ach_pilot_mode_enabled: setting[:enabled],
        configured_company_profile_ids: setting[:company_profile_ids],
        valid_company_profile_ids: valid_ids,
        misconfigured: setting[:enabled] && valid_ids.empty?
      }
    end

    # Enabling the pilot REQUIRES at least one existing company; refusing to persist an
    # empty allow-list keeps "pilot ON" from ever meaning "everyone".
    def set_pilot!(enabled:, company_profile_ids: nil, actor: nil, source: "admin")
      new_enabled = ActiveModel::Type::Boolean.new.cast(enabled) == true
      current = pilot_setting
      ids = company_profile_ids.nil? ? current[:company_profile_ids] : Array(company_profile_ids)
      ids = ids.map { |v| Integer(v.to_s, 10) rescue nil }.compact.select(&:positive?).uniq.sort
      existing_ids = CompanyProfile.where(id: ids).pluck(:id).sort
      missing = ids - existing_ids
      raise ArgumentError, "unknown company_profile_ids: #{missing.join(', ')}" if missing.any?
      raise ArgumentError, "pilot mode requires at least one company_profile_id" if new_enabled && existing_ids.empty?

      record = PlatformSetting.find_or_initialize_by(key: PILOT_SETTING_KEY)
      record.value_json = { "enabled" => new_enabled, "company_profile_ids" => existing_ids }
      record.save!
      AchFeatureAudit.create!(
        scope: "pilot",
        company_profile_id: nil,
        actor_user_id: actor&.id,
        actor_email: actor&.email,
        old_value: current[:enabled],
        new_value: new_enabled,
        source: source.to_s,
        metadata_json: {
          "old_company_profile_ids" => current[:company_profile_ids],
          "new_company_profile_ids" => existing_ids,
          "env_kill_switch" => env_kill_switch?,
          "global_enabled" => global_enabled_without_env_kill
        }
      )
      pilot_status
    end

    def set_global!(enabled:, actor: nil, source: "admin")
      new_val = ActiveModel::Type::Boolean.new.cast(enabled) == true
      old_val = global_enabled_without_env_kill
      record = PlatformSetting.find_or_initialize_by(key: GLOBAL_SETTING_KEY)
      record.value_json = { "enabled" => new_val }
      record.save!
      AchFeatureAudit.create!(
        scope: "global",
        company_profile_id: nil,
        actor_user_id: actor&.id,
        actor_email: actor&.email,
        old_value: old_val,
        new_value: new_val,
        source: source.to_s,
        metadata_json: { "env_kill_switch" => env_kill_switch? }
      )
      new_val
    end

    def set_company!(company_profile, enabled:, actor: nil, source: "admin")
      raise ArgumentError, "company_profile required" if company_profile.blank?

      new_val = ActiveModel::Type::Boolean.new.cast(enabled) == true
      old_val = company_profile.ach_payments_enabled == true
      # Flag-only write — avoid unrelated company profile validations blocking admin toggles.
      company_profile.update_column(:ach_payments_enabled, new_val)
      company_profile.reload
      AchFeatureAudit.create!(
        scope: "company",
        company_profile_id: company_profile.id,
        actor_user_id: actor&.id,
        actor_email: actor&.email,
        old_value: old_val,
        new_value: new_val,
        source: source.to_s,
        metadata_json: {}
      )
      new_val
    end
  end
end
