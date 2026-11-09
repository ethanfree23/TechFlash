# frozen_string_literal: true

# Staging outbound safety: block real-world communications while allowing
# Stripe TEST-mode API calls. This is independent of DemoMode (which simulates Stripe).
module StagingSandbox
  module_function

  def enabled?
    return true if Rails.env.staging?
    return true if ENV["STAGING_SANDBOX"].to_s.strip.casecmp("true").zero?

    false
  end

  def block_real_world_comms?
    enabled? && !ENV["STAGING_ALLOW_REAL_WORLD_COMMS"].to_s.strip.casecmp("true").zero?
  end

  def simulate_mail?
    block_real_world_comms? && !ENV["STAGING_ALLOW_MAIL_DELIVERY"].to_s.strip.casecmp("true").zero?
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
end
