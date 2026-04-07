# frozen_string_literal: true

# Mail gem has no Mail.register_delivery_method; Rails registers via ActionMailer::Base.add_delivery_method.
# Runs after config/environments/*.rb — do not use `next` in after_initialize blocks (LocalJumpError at boot).
require Rails.root.join("lib/mailtrap_http_delivery").to_s

unless ActionMailer::Base.delivery_methods.key?(:mailtrap_http)
  ActionMailer::Base.add_delivery_method :mailtrap_http, MailtrapHttpDelivery
end
