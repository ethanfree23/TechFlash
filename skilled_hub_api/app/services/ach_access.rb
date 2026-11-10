# frozen_string_literal: true

# Admin-controlled ACH (us_bank_account) feature flag.
#
# Effective rule for NEW ACH initiation only:
#   ENV ACH_GLOBAL_DISABLED is not true
#   AND global PlatformSetting enabled
#   AND company.ach_payments_enabled
#
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

    def allowed?(company_profile)
      global_enabled? && company_enabled?(company_profile)
    rescue StandardError
      false
    end

    def assert_allowed!(company_profile)
      return true if allowed?(company_profile)

      raise DisabledError, USER_SAFE_MESSAGE
    end

    def status_for(company_profile)
      {
        ach_payments_enabled: allowed?(company_profile),
        company_ach_payments_enabled: company_enabled?(company_profile),
        global_ach_payments_enabled: global_enabled?,
        ach_global_disabled_env: env_kill_switch?
      }
    rescue StandardError
      {
        ach_payments_enabled: false,
        company_ach_payments_enabled: false,
        global_ach_payments_enabled: false,
        ach_global_disabled_env: env_kill_switch?
      }
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
