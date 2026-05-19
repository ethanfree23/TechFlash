# frozen_string_literal: true

require "net/http"
require "uri"

# Sends SMS via Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set.
# Otherwise logs and returns :skipped (logs remain "queued" upstream unless updated).
class SmsDeliveryService

  def self.deliver!(to:, body:)
    if defined?(DemoMode) && DemoMode.enabled?
      Rails.logger.info("[sms] demo: simulated SMS to=#{to.inspect} (not sent)")
      return { status: :skipped, error: nil, simulated: true }
    end

    sid = ENV["TWILIO_ACCOUNT_SID"].to_s.strip.presence
    token = ENV["TWILIO_AUTH_TOKEN"].to_s.strip.presence
    from = ENV["TWILIO_FROM_NUMBER"].to_s.strip.presence
    dest = to.to_s.strip.presence

    unless sid && token && from && dest.present?
      Rails.logger.info("[sms] skipped missing Twilio env or destination to=#{to.inspect}")
      return { status: :skipped, error: nil }
    end

    uri = URI("https://api.twilio.com/2010-04-01/Accounts/#{sid}/Messages.json")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 8
    http.read_timeout = 15

    req = Net::HTTP::Post.new(uri)
    req.basic_auth(sid, token)
    req.set_form_data(
      "To" => dest,
      "From" => from,
      "Body" => body.to_s.truncate(1600)
    )

    res = http.request(req)
    if res.is_a?(Net::HTTPSuccess)
      { status: :sent, error: nil }
    else
      err = "#{res.code} #{res.body.to_s.truncate(500)}"
      Rails.logger.warn("[sms] Twilio error #{err}")
      { status: :failed, error: err }
    end
  rescue StandardError => e
    Rails.logger.warn("[sms] #{e.class}: #{e.message}")
    { status: :failed, error: e.message }
  end
end
