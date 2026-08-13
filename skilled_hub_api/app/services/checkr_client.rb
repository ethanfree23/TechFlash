require "net/http"
require "uri"
require "json"
require "cgi"
require "zlib"
require "stringio"

class CheckrClient
  class Error < StandardError; end
  BYTE_ORDER_MARK = "\uFEFF"

  def initialize
    @configuration = CheckrConfiguration.new
    @api_key = @configuration.api_key
    @default_package = @configuration.default_package
    @default_node_custom_id = @configuration.default_node_custom_id
    @base_url = normalize_base_url(@configuration.api_base_url)
  end

  def configured?
    @configuration.requests_allowed? && @api_key.present?
  end

  def default_package
    @default_package
  end

  def default_node_custom_id
    @default_node_custom_id
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

  def get_invitation(invitation_id:)
    get_json("/invitations/#{CGI.escape(invitation_id.to_s)}")
  end

  def create_candidate(user:, work_location:, custom_id:, zipcode: nil)
    email = user.email.to_s.strip
    raise Error, "Candidate email is missing on the user profile." if email.blank?

    payload = {
      first_name: user.first_name.to_s.presence || "Technician",
      last_name: user.last_name.to_s.presence || "User",
      email: email,
      custom_id: custom_id,
      work_locations: [checkr_work_location(work_location)]
    }
    payload[:zipcode] = zipcode.to_s.strip if zipcode.present?
    post_json("/candidates", payload)
  end

  def create_invitation(candidate_id:, package_name:, redirect_url:, work_location:, node_custom_id: nil)
    payload = {
      candidate_id: candidate_id,
      package: package_name.presence || @default_package,
      work_locations: [checkr_work_location(work_location)],
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

  def checkr_work_location(work_location)
    loc = work_location.to_h.symbolize_keys
    {
      country: GeocodingService.iso_country_code(loc[:country]),
      state: GeocodingService.us_state_abbreviation(loc[:state]),
      city: loc[:city].to_s.strip.presence
    }.compact
  end

  def normalize_base_url(raw_base_url)
    base = raw_base_url.to_s.chomp("/")
    return base if base.end_with?("/v1")

    "#{base}/v1"
  end

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
    unless @configuration.requests_allowed?
      raise Error, (@configuration.requests_block_reason || "Checkr integration is disabled.")
    end
    raise Error, "CHECKR secret key is not configured" if @api_key.blank?

    uri = URI.parse("#{@base_url}#{path}")
    if request.path != uri.request_uri
      original_request = request
      request = original_request.class.new(uri.request_uri)
      original_request.each_header do |header_name, header_value|
        request[header_name] = header_value
      end
      request.body = original_request.body if original_request.request_body_permitted?
    end
    request.basic_auth(@api_key, "")

    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 15, open_timeout: 10) do |http|
      http.request(request)
    end
    body = normalize_response_body(res.body, content_encoding: res["content-encoding"])
    parsed = body.present? ? JSON.parse(body) : {}

    unless res.is_a?(Net::HTTPSuccess)
      msg = parsed["error"] || parsed["message"] || "Checkr request failed"
      msg = "#{msg} (#{res.code})"
      raise Error, msg
    end
    parsed
  rescue JSON::ParserError => e
    status = res&.code || "unknown"
    ctype = res&.[]("content-type").to_s
    snippet = body.to_s[0, 160].gsub(/\s+/, " ")
    raise Error, "Invalid response from Checkr (status=#{status}, content_type=#{ctype}, parse_error=#{e.message}, body_start=#{snippet.inspect})"
  end

  def normalize_response_body(raw_body, content_encoding: nil)
    body = decode_response_body(raw_body.to_s, content_encoding: content_encoding)
    return body if body.empty?

    body.force_encoding(Encoding::UTF_8)
    body = body.encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "")
    body.delete_prefix(BYTE_ORDER_MARK)
  end

  def decode_response_body(raw_body, content_encoding: nil)
    return raw_body if raw_body.empty?

    encoding = content_encoding.to_s.downcase
    case encoding
    when "gzip", "x-gzip"
      Zlib::GzipReader.new(StringIO.new(raw_body)).read
    when "deflate"
      Zlib::Inflate.inflate(raw_body)
    else
      raw_body
    end
  rescue Zlib::Error
    raw_body
  end
end
