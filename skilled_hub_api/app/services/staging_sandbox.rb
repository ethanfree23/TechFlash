# frozen_string_literal: true

# Staging outbound safety: block real-world communications while allowing
# Stripe TEST-mode API calls. This is independent of DemoMode (which simulates Stripe).
#
# Fail-closed: when RAILS_ENV=staging, real-world channels stay blocked unless the
# dual unsafe override is set. A lone STAGING_ALLOW_REAL_WORLD_COMMS=true is ignored.
module StagingSandbox
  module_function

  def enabled?
    return true if Rails.env.staging?
    return true if ENV["STAGING_SANDBOX"].to_s.strip.casecmp("true").zero?

    false
  end

  def unsafe_real_world_override?
    ENV["STAGING_UNSAFE_ALLOW_REAL_WORLD_COMMS"].to_s.strip.casecmp("true").zero? &&
      ENV["STAGING_ALLOW_REAL_WORLD_COMMS"].to_s.strip.casecmp("true").zero?
  end

  def block_real_world_comms?
    return false unless enabled?
    return false if unsafe_real_world_override?

    true
  end

  def simulate_mail?
    # Mail sink (Mailtrap) may be enabled without opening SMS/Checkr/GHL.
    return false unless block_real_world_comms?
    return false if ENV["STAGING_ALLOW_MAIL_DELIVERY"].to_s.strip.casecmp("true").zero?

    true
  end

  def simulate_sms?
    block_real_world_comms?
  end

  def simulate_checkr?
    block_real_world_comms?
  end

  def simulate_ghl?
    block_real_world_comms?
  end

  def log_blocked(channel, detail = nil)
    Rails.logger.info("[staging_sandbox] blocked #{channel}#{" #{detail}" if detail}")
  end

  def assert_safe!
    return unless Rails.env.staging?

    if ENV["DEMO_MODE"].to_s.strip.casecmp("true").zero?
      raise "[staging] DEMO_MODE=true is forbidden"
    end
    if unsafe_real_world_override?
      Rails.logger.warn("[staging_sandbox] UNSAFE real-world override enabled")
    end
  end
end
