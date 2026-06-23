# frozen_string_literal: true

# Isolated demo environment — mirrors production deploy shape but blocks real outbound comms.
require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.demo_mode = true

  config.active_storage.service = :local

  if (opts = AppHost.url_options).present?
    config.action_controller.default_url_options = opts
    Rails.application.routes.default_url_options = opts
  end

  config.force_ssl = true

  config.logger = ActiveSupport::Logger.new($stdout)
    .tap  { |logger| logger.formatter = ::Logger::Formatter.new }
    .then { |logger| ActiveSupport::TaggedLogging.new(logger) }

  config.log_tags = [:request_id]
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.active_job.queue_adapter = :inline

  # Demo has no Redis service — duplicated env vars often set REDIS_URL anyway.
  config.cache_store = :memory_store

  # Never send real email in demo — log only via :test store.
  config.action_mailer.perform_caching = false
  config.action_mailer.delivery_method = :test
  config.action_mailer.raise_delivery_errors = false

  config.i18n.fallbacks = true
  config.active_support.report_deprecations = false
  config.active_record.dump_schema_after_migration = false

  config.after_initialize do
    Rails.logger.warn("[demo] Demo environment active — outbound mail/SMS/payments are simulated.")
    if ENV["DEMO_MODE"].to_s != "true"
      Rails.logger.warn("[demo] DEMO_MODE is not set to true — set DEMO_MODE=true on the demo Railway service.")
    end
  end
end
