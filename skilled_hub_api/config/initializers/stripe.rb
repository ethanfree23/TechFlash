# frozen_string_literal: true

# Secret key: sk_test_... or sk_live_... — use the same env name everywhere (local + production).
# Production: STRIPE_SECRET_KEY or credentials.
# Non-production: STRIPE_SECRET_KEY first, then optional STRIPE_SECRET_KEY_TEST (legacy name for a second key slot).
Stripe.api_key =
  if Rails.env.production?
    ENV['STRIPE_SECRET_KEY'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  else
    ENV['STRIPE_SECRET_KEY'].presence ||
      ENV['STRIPE_SECRET_KEY_TEST'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  end
