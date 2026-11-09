# frozen_string_literal: true

# Environment Stripe key mode guard.
# - production: require sk_live_
# - staging: require sk_test_ (real Stripe test API; never live; never DemoMode simulation)
# - demo: DemoMode handles test-only key loading separately
# Never logs or returns the secret itself.
class StripeModeGuard
  class Error < StandardError; end

  def self.allow_live_operations?
    error_message.nil?
  end

  def self.check!
    message = error_message
    raise Error, message if message

    nil
  end

  def self.mode_label
    key = Stripe.api_key.to_s
    return "missing" if key.blank?
    return "live" if key.start_with?("sk_live_")
    return "test" if key.start_with?("sk_test_")

    "unknown"
  end

  def self.error_message
    if staging_guard_applies?
      return staging_error_message
    end

    return nil unless production_guard_applies?

    key = Stripe.api_key.to_s
    if key.blank?
      return "Stripe is not configured for production (secret key missing). Refusing payment operations."
    end
    unless key.start_with?("sk_live_")
      return "Production Stripe secret key is not live mode (detected #{mode_label}). Refusing payment operations."
    end

    nil
  end

  def self.staging_error_message
    if defined?(DemoMode) && DemoMode.enabled?
      return "Staging refuses DemoMode. Staging must call real Stripe TEST APIs."
    end

    key = Stripe.api_key.to_s
    if key.blank?
      return "Stripe is not configured for staging (secret key missing). Set STRIPE_SECRET_KEY to sk_test_...."
    end
    if key.start_with?("sk_live_")
      return "Staging Stripe secret key must be test mode (sk_test_). Live keys are forbidden."
    end
    unless key.start_with?("sk_test_")
      return "Staging Stripe secret key is invalid (detected #{mode_label}). Expected sk_test_...."
    end

    nil
  end

  def self.production_guard_applies?
    return false if defined?(DemoMode) && DemoMode.enabled?
    return false unless Rails.env.production?

    true
  end

  def self.staging_guard_applies?
    Rails.env.staging? || ENV["FORCE_STRIPE_STAGING_GUARD"].to_s.strip.casecmp("true").zero?
  end
end
