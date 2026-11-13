# frozen_string_literal: true

# Temporary server-side gate for post-publish fund_preview / fund endpoints.
# Defaults OFF. C-1/C-2 hardening landed via #40; keep this gate OFF until the
# owner explicitly enables post-publish funding after merge/deploy review.
#
# Enable either:
#   ENV POST_PUBLISH_FUNDING_ENABLED=true
#   OR PlatformSetting key "post_publish_funding_enabled" => { "enabled" => true }
#
# Fail closed on absent setting / lookup errors. Does not charge, create a
# mandate, or bypass bank verification by itself.
class PostPublishFundingAccess
  ENV_KEY = "POST_PUBLISH_FUNDING_ENABLED".freeze
  SETTING_KEY = "post_publish_funding_enabled".freeze
  USER_SAFE_MESSAGE =
    "Post-publish funding is temporarily unavailable. Try again later or contact support.".freeze

  class << self
    def env_enabled?
      ENV[ENV_KEY].to_s.strip.casecmp("true").zero?
    end

    def setting_enabled?
      raw = PlatformSetting.find_by(key: SETTING_KEY)&.value_json
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

    def enabled?
      env_enabled? || setting_enabled?
    rescue StandardError
      false
    end

    def assert_enabled!
      return true if enabled?

      raise DisabledError, USER_SAFE_MESSAGE
    end

    def set_enabled!(enabled:, actor: nil, source: "admin")
      new_val = ActiveModel::Type::Boolean.new.cast(enabled) == true
      record = PlatformSetting.find_or_initialize_by(key: SETTING_KEY)
      record.value_json = { "enabled" => new_val }
      record.save!
      new_val
    end
  end

  class DisabledError < StandardError
    def initialize(message = USER_SAFE_MESSAGE)
      super(message)
    end
  end
end
