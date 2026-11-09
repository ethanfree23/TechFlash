# frozen_string_literal: true

require "active_support/core_ext/integer/time"
require_relative "../mail_env"

# Staging is production-like but uses Stripe TEST mode and sandboxes outbound
# business communications. DemoMode must remain disabled here.
Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false

  config.active_storage.service = :local

  if (opts = AppHost.url_options).present?
    config.action_controller.default_url_options = opts
    Rails.application.routes.default_url_options = opts
  end

  config.force_ssl = true

  config.logger = ActiveSupport::Logger.new(STDOUT)
    .tap  { |logger| logger.formatter = ::Logger::Formatter.new }
    .then { |logger| ActiveSupport::TaggedLogging.new(logger) }

  config.log_tags = [:request_id]
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Same durability model as production until a real queue exists.
  config.active_job.queue_adapter = :inline

  config.action_mailer.perform_caching = false
  config.action_mailer.raise_delivery_errors = true

  # Staging never sends real customer email: force test delivery unless an
  # explicit capture sink is configured (MAILTRAP sandbox / SMTP sink).
  if ENV["STAGING_ALLOW_MAIL_DELIVERY"].to_s.strip.casecmp("true").zero?
    mailtrap_http = MailEnv.mailtrap_http_delivery?
    if mailtrap_http
      config.action_mailer.delivery_method = :mailtrap_http
      config.action_mailer.mailtrap_http_settings = {
        api_token: ENV["MAILTRAP_API_TOKEN"].presence || ENV["SMTP_PASSWORD"].presence
      }
    elsif ENV["SMTP_ADDRESS"].present?
      default_smtp_auth =
        ENV["SMTP_USERNAME"].to_s.casecmp("api").zero? ? "login" : "plain"
      smtp_auth = ENV.fetch("SMTP_AUTHENTICATION", default_smtp_auth).downcase.to_sym
      smtp_auth = :plain unless %i[plain login cram_md5].include?(smtp_auth)
      config.action_mailer.delivery_method = :smtp
      config.action_mailer.smtp_settings = {
        address: ENV["SMTP_ADDRESS"],
        port: (ENV["SMTP_PORT"] || 587).to_i,
        user_name: ENV["SMTP_USERNAME"],
        password: ENV["SMTP_PASSWORD"],
        authentication: smtp_auth,
        enable_starttls_auto: true,
        open_timeout: ENV.fetch("SMTP_OPEN_TIMEOUT", 30).to_i,
        read_timeout: ENV.fetch("SMTP_READ_TIMEOUT", 60).to_i
      }
    else
      config.action_mailer.delivery_method = :test
    end
  else
    config.action_mailer.delivery_method = :test
  end

  config.i18n.fallbacks = true
  config.active_support.report_deprecations = false
  config.active_record.dump_schema_after_migration = false

  # Host allowlist for Railway staging domains (override with APP_HOST / STAGING_HOSTS).
  hosts = []
  hosts << ENV["APP_HOST"].to_s.strip if ENV["APP_HOST"].present?
  ENV.fetch("STAGING_HOSTS", "").split(",").map(&:strip).reject(&:blank?).each { |h| hosts << h }
  hosts << /.*\.up\.railway\.app/
  hosts << /.*\.vercel\.app/
  config.hosts = hosts if hosts.any?
  config.host_authorization = { exclude: ->(request) { request.path == "/up" || request.path == "/api/v1/meta" } }

  config.after_initialize do
    if defined?(DemoMode) && DemoMode.enabled?
      raise "[staging] DemoMode must be disabled in staging (real Stripe test mode required)"
    end
    if Stripe.api_key.to_s.start_with?("sk_live_")
      raise "[staging] Live Stripe secret key is forbidden in staging"
    end
    unless Stripe.api_key.to_s.start_with?("sk_test_")
      Rails.logger.error("[staging] Stripe test secret key missing or invalid (expected sk_test_...)")
    end
    Rails.logger.warn("[staging] boot: RAILS_ENV=staging DemoMode=false StripeMode=#{StripeModeGuard.mode_label}")
  end
end
