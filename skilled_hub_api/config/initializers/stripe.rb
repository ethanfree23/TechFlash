# frozen_string_literal: true

# Secret key: sk_test_... or sk_live_... — use the same env name everywhere (local + production).
# Production: STRIPE_SECRET_KEY or credentials.
# Demo: test keys only — never live.
# Non-production: STRIPE_SECRET_KEY first, then optional STRIPE_SECRET_KEY_TEST (legacy name for a second key slot).
demo_stripe_secret_key = lambda do
  test_env = ENV["STRIPE_SECRET_KEY_TEST"].to_s.strip
  return test_env if test_env.start_with?("sk_test_")

  legacy = ENV["STRIPE_SECRET_KEY"].to_s.strip
  return legacy if legacy.start_with?("sk_test_")

  if test_env.present? && !test_env.start_with?("sk_test_")
    raise "Demo environment Stripe key must be sk_test_.... " \
          "Fix STRIPE_SECRET_KEY_TEST on Railway demo (Stripe → Test mode → API keys)."
  end

  if legacy.start_with?("sk_live_")
    Rails.logger.warn(
      "[demo] Ignoring STRIPE_SECRET_KEY (live) on demo host. " \
      "Remove it from Railway demo variables; use STRIPE_SECRET_KEY_TEST only."
    )
  end

  nil # Do not fall back to credentials — production live keys share the same RAILS_MASTER_KEY.
end

staging_stripe_secret_key = lambda do
  # Never fall back to Rails encrypted credentials / production master key.
  key = ENV["STRIPE_SECRET_KEY"].to_s.strip.presence || ENV["STRIPE_SECRET_KEY_TEST"].to_s.strip.presence
  if key.to_s.start_with?("sk_live_")
    raise "Staging Stripe key must be sk_test_.... Live keys are forbidden on RAILS_ENV=staging."
  end
  unless key.to_s.start_with?("sk_test_")
    raise "Staging Stripe key missing or invalid. Set STRIPE_SECRET_KEY to sk_test_.... " \
          "Staging does not read production credentials."
  end
  key
end

Stripe.api_key =
  if defined?(DemoMode) && DemoMode.enabled?
    demo_stripe_secret_key.call
  elsif Rails.env.staging?
    staging_stripe_secret_key.call
  elsif Rails.env.production?
    if ENV["DEMO_MODE"].to_s.strip.casecmp("true").zero?
      raise "Production refuses DEMO_MODE=true. Use sk_live_ Stripe keys only."
    end
    ENV['STRIPE_SECRET_KEY'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  else
    ENV['STRIPE_SECRET_KEY'].presence ||
      ENV['STRIPE_SECRET_KEY_TEST'].presence ||
      Rails.application.credentials.dig(:stripe, :secret_key).presence
  end
