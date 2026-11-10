# frozen_string_literal: true

# Prefer ENV. Staging never requires encrypted credentials / RAILS_MASTER_KEY.
dsn = ENV["SENTRY_DSN"].presence || CredentialsSafe.dig(:sentry, :dsn)
if dsn.present?
  Sentry.init do |config|
    config.dsn = dsn
    config.breadcrumbs_logger = %i[active_support_logger http_logger]
    config.environment = ENV.fetch("SENTRY_ENV", Rails.env)
    config.traces_sample_rate = ENV.fetch("SENTRY_TRACES_SAMPLE_RATE", "0.1").to_f
  end
end
