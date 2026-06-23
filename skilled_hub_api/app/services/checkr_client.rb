require "net/http"
require "uri"
require "json"

class CheckrClient
  class Error < StandardError; end

  BASE_URL = "https://api.checkr.com/v1".freeze

  def initialize
    @api_key = ENV["CHECKR_API_KEY"].presence || Rails.application.credentials.dig(:checkr, :api_key).presence
    @default_package = ENV["CHECKR_DEFAULT_PACKAGE"].presence || "essential_plus"
  end

  def configured?
    @api_key.present?
  end

  def default_package
    @default_package
  end

  def create_candidate(user:)
    post_json("/candidates", {
      first_name: user.first_name.to_s.presence || "Technician",
      last_name: user.last_name.to_s.presence || "User",
      email: user.email
    })
  end

  def create_invitation(candidate_id:, package_name:, redirect_url:)
    post_json("/invitations", {
      candidate_id: candidate_id,
      package: package_name.presence || @default_package,
      work_locations: [],
      invitation_url: redirect_url
    })
  end

  private

  def post_json(path, payload)
    raise Error, "CHECKR_API_KEY is not configured" unless configured?

    uri = URI.parse("#{BASE_URL}#{path}")
    req = Net::HTTP::Post.new(uri.request_uri)
    req.basic_auth(@api_key, "")
    req["Content-Type"] = "application/json"
    req.body = payload.to_json

    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 15, open_timeout: 10) do |http|
      http.request(req)
    end
    body = res.body.to_s
    parsed = body.present? ? JSON.parse(body) : {}

    unless res.is_a?(Net::HTTPSuccess)
      msg = parsed["error"] || parsed["message"] || "Checkr request failed"
      raise Error, msg
    end
    parsed
  rescue JSON::ParserError
    raise Error, "Invalid response from Checkr"
  end
end
