# frozen_string_literal: true

class GhlConfiguration
  def self.webhook_secret
    ENV["GHL_WEBHOOK_SECRET"].to_s.strip.presence
  end
end
