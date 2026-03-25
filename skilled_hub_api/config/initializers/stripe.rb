# frozen_string_literal: true

# Production: live secret via STRIPE_SECRET_KEY or credentials (never commit keys).
# Development/test: STRIPE_SECRET_KEY_TEST (sandbox) first, then STRIPE_SECRET_KEY, then credentials —
# so you can keep test keys locally without mixing them with live.
Stripe.api_key =
  if Rails.env.production?
    ENV['STRIPE_SECRET_KEY'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  else
    ENV['STRIPE_SECRET_KEY_TEST'].presence ||
      ENV['STRIPE_SECRET_KEY'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  end
