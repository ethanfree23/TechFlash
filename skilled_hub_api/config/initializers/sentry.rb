# frozen_string_literal: true

dsn = ENV['SENTRY_DSN'].presence || Rails.application.credentials.dig(:sentry, :dsn)
if dsn.present?
  Sentry.init do |config|
    config.dsn = dsn
    config.breadcrumbs_logger = %i[active_support_logger http_logger]
    config.environment = ENV.fetch('SENTRY_ENV', Rails.env)
    config.traces_sample_rate = ENV.fetch('SENTRY_TRACES_SAMPLE_RATE', '0.1').to_f
  end
end
