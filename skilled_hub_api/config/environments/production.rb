require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot. This eager loads most of Rails and
  # your application in memory, allowing both threaded web servers
  # and those relying on copy on write to perform better.
  # Rake tasks automatically ignore this option for performance.
  config.eager_load = true

  # Full error reports are disabled and caching is turned on.
  config.consider_all_requests_local = false

  # Ensures that a master key has been made available in ENV["RAILS_MASTER_KEY"], config/master.key, or an environment
  # key such as config/credentials/production.key. This key is used to decrypt credentials (and other encrypted files).
  # config.require_master_key = true

  # Disable serving static files from `public/`, relying on NGINX/Apache to do so instead.
  # config.public_file_server.enabled = false

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Specifies the header that your server uses for sending files.
  # config.action_dispatch.x_sendfile_header = "X-Sendfile" # for Apache
  # config.action_dispatch.x_sendfile_header = "X-Accel-Redirect" # for NGINX

  # Store uploaded files on the local file system (see config/storage.yml for options).
  config.active_storage.service = :local

  # Required for rails_blob_url in serializers (avatar_url). Set APP_HOST in Railway to your API domain.
  if (host = ENV["APP_HOST"]).present?
    config.action_controller.default_url_options = { host: host, protocol: "https" }
    Rails.application.routes.default_url_options = config.action_controller.default_url_options
  end

  # Mount Action Cable outside main process or domain.
  # config.action_cable.mount_path = nil
  # config.action_cable.url = "wss://example.com/cable"
  # config.action_cable.allowed_request_origins = [ "http://example.com", /http:\/\/example.*/ ]

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  # Can be used together with config.force_ssl for Strict-Transport-Security and secure cookies.
  # config.assume_ssl = true

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.force_ssl = true

  # Log to STDOUT by default
  config.logger = ActiveSupport::Logger.new(STDOUT)
    .tap  { |logger| logger.formatter = ::Logger::Formatter.new }
    .then { |logger| ActiveSupport::TaggedLogging.new(logger) }

  # Prepend all log lines with the following tags.
  config.log_tags = [ :request_id ]

  # "info" includes generic and useful information about system operation, but avoids logging too much
  # information to avoid inadvertent exposure of personally identifiable information (PII). If you
  # want to log everything, set the level to "debug".
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Use a different cache store in production.
  # config.cache_store = :mem_cache_store

  # No Redis/Sidekiq on Railway yet: :async can drop or skip mail jobs in-process.
  # Inline runs deliver_later mail during the HTTP request (OK until a real queue is added).
  config.active_job.queue_adapter = :inline

  # config.active_job.queue_name_prefix = "skilled_hub_api_production"

  config.action_mailer.perform_caching = false

  # Use Mailtrap HTTPS API only when explicitly enabled.
  # This avoids accidentally routing production mail to Mailtrap when SMTP_PASSWORD is set.
  mailtrap_http =
    ENV['MAILTRAP_USE_HTTP'] == 'true' ||
    (ENV['MAILTRAP_USE_HTTP'].blank? && ENV['MAILTRAP_API_TOKEN'].present?)

  if mailtrap_http
    config.action_mailer.delivery_method = :mailtrap_http
    config.action_mailer.mailtrap_http_settings = {
      api_token: ENV['SMTP_PASSWORD'].presence || ENV['MAILTRAP_API_TOKEN']
    }
  # Same SMTP env vars as development: SMTP_ADDRESS, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD
  # Optional: SMTP_AUTHENTICATION=login (Mailtrap’s Rails sample uses login; default is plain)
  elsif ENV['SMTP_ADDRESS'].present?
    smtp_auth = ENV.fetch('SMTP_AUTHENTICATION', 'plain').downcase.to_sym
    smtp_auth = :plain unless %i[plain login cram_md5].include?(smtp_auth)

    config.action_mailer.delivery_method = :smtp
    config.action_mailer.smtp_settings = {
      address:              ENV['SMTP_ADDRESS'],
      port:                 (ENV['SMTP_PORT'] || 587).to_i,
      user_name:            ENV['SMTP_USERNAME'],
      password:             ENV['SMTP_PASSWORD'],
      authentication:       smtp_auth,
      enable_starttls_auto:  true
    }
  end

  # Must be true so SMTP failures raise; MailDelivery.safe_deliver logs them without failing the API.
  config.action_mailer.raise_delivery_errors = true

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Enable DNS rebinding protection and other `Host` header attacks.
  # config.hosts = [
  #   "example.com",     # Allow requests from example.com
  #   /.*\.example\.com/ # Allow requests from subdomains like `www.example.com`
  # ]
  # Skip DNS rebinding protection for the default health check endpoint.
  # config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  config.after_initialize do
    mailtrap_http =
      ENV['MAILTRAP_USE_HTTP'] == 'true' ||
      (ENV['MAILTRAP_USE_HTTP'].blank? && ENV['MAILTRAP_API_TOKEN'].present?)

    if mailtrap_http
      Rails.logger.warn(
        '[mail] boot: delivery=mailtrap_http api_token=' \
        "#{ENV['SMTP_PASSWORD'].present? || ENV['MAILTRAP_API_TOKEN'].present?} " \
        "MAILER_FROM=#{ENV['MAILER_FROM'].present?}"
      )
      if ENV['SMTP_PASSWORD'].blank? && ENV['MAILTRAP_API_TOKEN'].blank?
        Rails.logger.error('[mail] Mailtrap HTTP requires SMTP_PASSWORD or MAILTRAP_API_TOKEN')
      end
    else
      Rails.logger.warn(
        '[mail] boot: smtp_configured=' \
        "#{ENV['SMTP_ADDRESS'].present? && ENV['SMTP_PASSWORD'].present? && ENV['SMTP_USERNAME'].present?} " \
        "MAILER_FROM=#{ENV['MAILER_FROM'].present?}"
      )
      if ENV['SMTP_ADDRESS'].blank? || ENV['SMTP_PASSWORD'].blank?
        Rails.logger.error('[mail] SMTP_ADDRESS or SMTP_PASSWORD missing — app cannot send mail (Mailtrap SMTP).')
      end
    end
  end
end
