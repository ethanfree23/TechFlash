# frozen_string_literal: true

# Mail gem has no Mail.register_delivery_method; Rails registers via ActionMailer::Base.add_delivery_method.
Rails.application.config.after_initialize do
  require Rails.root.join("lib/mailtrap_http_delivery")
  next if ActionMailer::Base.delivery_methods.key?(:mailtrap_http)

  ActionMailer::Base.add_delivery_method :mailtrap_http, MailtrapHttpDelivery
end
