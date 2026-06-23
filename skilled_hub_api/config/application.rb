require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
require "action_mailbox/engine"
require "action_text/engine"
require "action_view/railtie"
require "action_cable/engine"
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module SkilledHubApi
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 7.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w(assets tasks))

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # Must run before config/environments/*.rb — production sets
    # config.action_mailer.mailtrap_http_settings, which calls ActionMailer::Base.mailtrap_http_settings=
    # only after add_delivery_method :mailtrap_http defines that setter.
    initializer :register_mailtrap_http_delivery, before: :load_environment_config do
      require "action_mailer/base"
      require Rails.root.join("lib/mailtrap_http_delivery").to_s
      unless ActionMailer::Base.delivery_methods.key?(:mailtrap_http)
        ActionMailer::Base.add_delivery_method :mailtrap_http, MailtrapHttpDelivery
      end
    end

    initializer :load_app_host, before: :load_environment_config do
      require Rails.root.join("lib/app_host").to_s
    end
  end
end
