# frozen_string_literal: true

# Production-only guard: refuse marketplace Stripe calls when the secret key is not live.
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

  def self.production_guard_applies?
    return false if defined?(DemoMode) && DemoMode.enabled?
    return false unless Rails.env.production?

    true
  end
end
