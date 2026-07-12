require "net/http"
require "uri"
require "json"
require "cgi"

class CheckrClient
  class Error < StandardError; end

  BASE_URL = "https://api.checkr.com/v1".freeze

  def initialize
    @api_key =
      ENV["CHECKR_STAGING_API_KEY"].presence ||
      ENV["CHECKR_API_KEY"].presence ||
      Rails.application.credentials.dig(:checkr, :staging_api_key).presence ||
      Rails.application.credentials.dig(:checkr, :api_key).presence
    @default_package = ENV["CHECKR_DEFAULT_PACKAGE"].presence || "essential_plus"
  end

  def configured?
    @api_key.present?
  end

  def default_package
    @default_package
  end

  def list_packages
    response = get_json("/packages")
    response.is_a?(Array) ? response : Array(response["data"])
  end

  def list_nodes
    response = get_json("/nodes")
    response.is_a?(Array) ? response : Array(response["data"])
  rescue Error
    []
  end

  def get_candidate(candidate_id:)
    get_json("/candidates/#{CGI.escape(candidate_id.to_s)}")
  end

  def create_candidate(user:, work_location:, custom_id:, zipcode: nil)
    payload = {
      first_name: user.first_name.to_s.presence || "Technician",
      last_name: user.last_name.to_s.presence || "User",
      email: user.email.to_s.strip,
      custom_id: custom_id,
      work_locations: [
        {
          country: work_location[:country],
          state: work_location[:state],
          city: work_location[:city]
        }.compact
      ]
    }
    payload[:zipcode] = zipcode.to_s.strip if zipcode.present?
    post_json("/candidates", payload)
  end

  def create_invitation(candidate_id:, package_name:, redirect_url:, work_location:, node_custom_id: nil)
    payload = {
      candidate_id: candidate_id,
      package: package_name.presence || @default_package,
      work_locations: [
        {
          country: work_location[:country],
          state: work_location[:state],
          city: work_location[:city]
        }.compact
      ],
      invitation_url: redirect_url
    }
    payload[:node] = node_custom_id if node_custom_id.present?

    post_json("/invitations", {
      **payload
    })
  end

  def get_report(report_id:)
    get_json("/reports/#{CGI.escape(report_id.to_s)}")
  end

  private

  def get_json(path)
    request_json(Net::HTTP::Get.new(path), path: path)
  end

  def post_json(path, payload)
    req = Net::HTTP::Post.new(path)
    req["Content-Type"] = "application/json"
    req.body = payload.to_json
    request_json(req, path: path)
  end

  def request_json(request, path:)
    raise Error, "CHECKR_API_KEY is not configured" unless configured?

    uri = URI.parse("#{BASE_URL}#{path}")
    request = request.class.new(uri.request_uri) unless request.path == uri.request_uri
    request.basic_auth(@api_key, "")

    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 15, open_timeout: 10) do |http|
      http.request(request)
    end
    body = res.body.to_s
    parsed = body.present? ? JSON.parse(body) : {}

    unless res.is_a?(Net::HTTPSuccess)
      msg = parsed["error"] || parsed["message"] || "Checkr request failed"
      msg = "#{msg} (#{res.code})"
      raise Error, msg
    end
    parsed
  rescue JSON::ParserError
    raise Error, "Invalid response from Checkr"
  end
end
