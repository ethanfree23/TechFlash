# frozen_string_literal: true

require "ipaddr"
require "net/http"
require "resolv"
require "stringio"

class GhlRemoteImageFetcher
  class Error < StandardError; end

  Result = Struct.new(:io, :content_type, :filename, :bytesize, keyword_init: true)

  MAX_BYTES = 8.megabytes
  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 10
  MAX_REDIRECTS = 3
  USER_AGENT = "TechFlash-GHL-ProfilePhoto/1.0"

  EXT_FOR = {
    "image/jpeg" => "jpg",
    "image/png" => "png",
    "image/gif" => "gif",
    "image/webp" => "webp",
    "image/bmp" => "bmp"
  }.freeze

  BLOCKED_RANGES = [
    IPAddr.new("0.0.0.0/8"),
    IPAddr.new("10.0.0.0/8"),
    IPAddr.new("127.0.0.0/8"),
    IPAddr.new("169.254.0.0/16"),
    IPAddr.new("172.16.0.0/12"),
    IPAddr.new("192.168.0.0/16"),
    IPAddr.new("::1/128"),
    IPAddr.new("fc00::/7"),
    IPAddr.new("fe80::/10")
  ].freeze

  def self.fetch(url)
    new(url).fetch
  end

  def initialize(url)
    @url = url.to_s.strip
  end

  def fetch
    uri = parse_uri!(@url)
    body, final_uri, content_type = request!(uri, redirects_left: MAX_REDIRECTS)
    detected = detect_image_type!(body)
    io = StringIO.new(body)
    io.set_encoding(Encoding::BINARY)
    io.rewind
    Result.new(
      io: io,
      content_type: detected,
      filename: filename_for(final_uri, detected),
      bytesize: body.bytesize
    )
  end

  private

  def parse_uri!(raw)
    raise Error, "image URL is required" if raw.blank?

    uri = URI.parse(raw)
    unless uri.is_a?(URI::HTTP) && uri.scheme.to_s.match?(/\Ahttps?\z/i)
      raise Error, "image URL must be http or https"
    end
    raise Error, "image URL is invalid" if uri.host.blank? || uri.userinfo.present?

    uri
  rescue URI::InvalidURIError
    raise Error, "image URL is invalid"
  end

  def request!(uri, redirects_left:)
    raise Error, "too many redirects" if redirects_left.negative?

    assert_public_host!(uri)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = OPEN_TIMEOUT
    http.read_timeout = READ_TIMEOUT
    http.max_retries = 0

    req = Net::HTTP::Get.new(uri.request_uri.presence || "/")
    req["User-Agent"] = USER_AGENT
    req["Accept"] = "image/jpeg,image/png,image/gif,image/webp,image/bmp,image/*;q=0.8"

    res = http.request(req)
    case res
    when Net::HTTPSuccess
      body = read_body!(res)
      [body, uri, res["content-type"].to_s]
    when Net::HTTPRedirection
      loc = res["location"].to_s.strip
      raise Error, "invalid redirect" if loc.blank?

      next_uri = URI.join(uri, loc)
      request!(next_uri, redirects_left: redirects_left - 1)
    else
      raise Error, "could not download image (HTTP #{res.code})"
    end
  rescue Error
    raise
  rescue SocketError, Errno::ECONNREFUSED, Errno::ETIMEDOUT, Net::OpenTimeout, Net::ReadTimeout => e
    raise Error, "could not download image (#{e.class})"
  end

  def read_body!(res)
    length = res["content-length"].to_i
    raise Error, "image is too large" if length.positive? && length > MAX_BYTES

    body = res.body.to_s
    raise Error, "image is too large" if body.bytesize > MAX_BYTES
    raise Error, "downloaded file was empty" if body.blank?

    body
  end

  def assert_public_host!(uri)
    addresses = Resolv.getaddresses(uri.host)
    raise Error, "image host could not be resolved" if addresses.blank?
    raise Error, "image URL is not allowed" if addresses.any? { |ip| blocked_ip?(ip) }
  rescue Resolv::ResolvError
    raise Error, "image host could not be resolved"
  end

  def blocked_ip?(ip)
    addr = IPAddr.new(ip)
    addr = addr.native if addr.ipv4_mapped?
    return true if addr.loopback? || addr.link_local?

    BLOCKED_RANGES.any? { |range| range.include?(addr) }
  rescue IPAddr::InvalidAddressError, ArgumentError
    true
  end

  def detect_image_type!(bytes)
    inspection = RasterImageInspector.inspect(bytes)
    return inspection.content_type if inspection.accepted?

    raise Error, "file is not an allowed image type"
  end

  def filename_for(uri, content_type)
    ext = EXT_FOR.fetch(content_type, "jpg")
    base = File.basename(uri.path.to_s).to_s.sub(/\.[a-z0-9]+\z/i, "")
    base = "ghl-profile-photo" unless base.match?(/\A[a-zA-Z0-9._-]{1,80}\z/)
    "#{base}.#{ext}"
  end
end
