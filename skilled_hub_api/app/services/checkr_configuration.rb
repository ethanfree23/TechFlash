class CheckrConfiguration
  DEFAULT_API_BASE_URL = "https://api.checkr.com".freeze
  SUPPORTED_ENVIRONMENTS = %w[staging production].freeze

  def initialize(env: ENV, rails_env: Rails.env, credentials: Rails.application.credentials)
    @env = env
    @rails_env = rails_env.to_s
    @credentials = credentials
  end

  def enabled?
    bool_env("CHECKR_ENABLED", default: true)
  end

  def background_checks_enabled?
    bool_env("CHECKR_BACKGROUND_CHECKS_ENABLED", default: true)
  end

  def demo_bypass_enabled?
    bool_env("CHECKR_DEMO_BYPASS", default: false)
  end

  def production_enabled?
    bool_env("CHECKR_PRODUCTION_ENABLED", default: false)
  end

  def environment
    configured = @env["CHECKR_ENVIRONMENT"].to_s.strip.downcase
    return configured if SUPPORTED_ENVIRONMENTS.include?(configured)

    @rails_env == "production" ? "production" : "staging"
  end

  def staging_environment?
    environment == "staging"
  end

  def production_environment?
    environment == "production"
  end

  def api_base_url
    configured = @env["CHECKR_API_BASE_URL"].to_s.strip
    (configured.presence || DEFAULT_API_BASE_URL).chomp("/")
  end

  def api_key
    configured_secret = @env["CHECKR_SECRET_KEY"].to_s.strip
    return configured_secret if configured_secret.present?

    # Rails.env.staging? (TechFlash staging) uses ENV only — no encrypted credentials.
    if @rails_env == "staging"
      return @env["CHECKR_STAGING_API_KEY"].presence || @env["CHECKR_API_KEY"].presence
    end

    if production_environment?
      # Fail closed: never silently fall back to staging credentials in production.
      return @env["CHECKR_API_KEY"].presence || safe_credentials_dig(:checkr, :api_key)
    end

    if staging_environment?
      @env["CHECKR_STAGING_API_KEY"].presence ||
        @env["CHECKR_API_KEY"].presence ||
        safe_credentials_dig(:checkr, :staging_api_key) ||
        safe_credentials_dig(:checkr, :api_key)
    else
      @env["CHECKR_API_KEY"].presence ||
        safe_credentials_dig(:checkr, :api_key)
    end
  end

  def webhook_secret
    # Production must sign with the API key (CHECKR_SECRET_KEY), not a legacy webhook secret.
    return nil if production_environment?

    @env["CHECKR_WEBHOOK_SECRET"].presence ||
      (@rails_env == "staging" ? nil : safe_credentials_dig(:checkr, :webhook_secret))
  end

  def webhook_url
    @env["CHECKR_WEBHOOK_URL"].to_s.strip.presence
  end

  # Production account package (owner decision): checkrdirect_essential_criminal.
  # Never invent a slug — validate against GET /v1/packages at start time and fail closed.
  def default_package
    @env["CHECKR_DEFAULT_PACKAGE_SLUG"].to_s.strip.presence ||
      @env["CHECKR_DEFAULT_PACKAGE"].to_s.strip.presence
  end

  def staging_api_base_url
    "https://api.checkr-staging.com"
  end

  def production_api_base_url
    DEFAULT_API_BASE_URL
  end

  def default_node_custom_id
    @env["CHECKR_DEFAULT_NODE_CUSTOM_ID"]
  end

  def requests_allowed?
    return false unless enabled?
    return false unless background_checks_enabled?
    return false if production_environment? && !production_enabled?

    true
  end

  def requests_block_reason
    return "Checkr integration is disabled." unless enabled?
    return "Background checks are disabled by configuration." unless background_checks_enabled?
    return "Checkr production mode is disabled for this environment." if production_environment? && !production_enabled?

    nil
  end

  private

  def bool_env(key, default:)
    raw = @env[key]
    return default if raw.nil?

    ActiveModel::Type::Boolean.new.cast(raw)
  end

  def safe_credentials_dig(*path)
    return nil if @credentials.nil?

    @credentials.dig(*path)
  rescue ActiveSupport::EncryptedFile::MissingKeyError, ArgumentError
    nil
  end
end
