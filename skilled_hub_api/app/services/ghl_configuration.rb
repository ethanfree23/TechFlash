# frozen_string_literal: true

class GhlConfiguration
  BASE_URL = "https://services.leadconnectorhq.com"

  def self.webhook_secret
    ENV["GHL_WEBHOOK_SECRET"].to_s.strip.presence
  end

  def self.private_integration_token
    ENV["GHL_PRIVATE_INTEGRATION_TOKEN"].to_s.strip.presence
  end

  def self.location_id
    ENV["GHL_LOCATION_ID"].to_s.strip.presence
  end

  def self.outbound_configured?
    private_integration_token.present? && location_id.present?
  end
end

