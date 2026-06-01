# frozen_string_literal: true

require "net/http"
require "uri"
require "nokogiri"
require "json"

class CrmLeadUrlEnrichment
  class Error < StandardError; end

  MAX_BYTES = 512_000
  TIMEOUT_SEC = 8
  MAX_REDIRECTS = 3

  SOCIAL_PATTERNS = {
    instagram_url: %r{https?://(?:www\.)?instagram\.com/[\w.\-]+/?}i,
    facebook_url: %r{https?://(?:www\.)?facebook\.com/[\w.\-]+/?}i,
    linkedin_url: %r{https?://(?:www\.)?linkedin\.com/(?:company|in)/[\w.\-]+/?}i
  }.freeze

  def self.call(url)
    new(url).call
  end

  def initialize(raw_url)
    @raw_url = raw_url.to_s.strip
  end

  def call
    normalized = normalize_url(@raw_url)
    raise Error, "URL is required" if normalized.blank?

    html, final_url = fetch_html(normalized)
  rescue Error
    raise
  rescue StandardError => e
    raise Error, "Could not fetch website: #{e.message}"
  else
    @doc = Nokogiri::HTML(html)
    @body_text = @doc.text.to_s
    links = @doc.css("a[href]").map { |a| a["href"].to_s }

    {
      website: final_url,
      name: meta_content(@doc, "og:site_name") || meta_content(@doc, "og:title") || title_text(@doc),
      bio: meta_content(@doc, "og:description") || meta_content(@doc, "description"),
      company_email: first_match(@body_text, links, /mailto:([^\s"'?]+)/i) { |m| m[1] },
      company_phone: first_phone(@body_text, links),
      street_address: parsed_address[:street_address],
      city: parsed_address[:city],
      state: parsed_address[:state],
      zip: parsed_address[:zip],
      instagram_url: find_social(:instagram_url, @body_text, links),
      facebook_url: find_social(:facebook_url, @body_text, links),
      linkedin_url: find_social(:linkedin_url, @body_text, links)
    }.transform_values { |v| v.presence }
  end

  private

  def normalize_url(raw)
    s = raw.to_s.strip
    return nil if s.blank?
    s = "https://#{s}" unless s.match?(%r{\Ahttps?://}i)
    uri = URI.parse(s)
    return nil unless uri.is_a?(URI::HTTP)
    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def fetch_html(url, redirects_left: MAX_REDIRECTS)
    raise Error, "Too many redirects" if redirects_left.negative?

    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = TIMEOUT_SEC
    http.read_timeout = TIMEOUT_SEC

    req = Net::HTTP::Get.new(uri.request_uri.presence || "/")
    req["User-Agent"] = "TechFlash-CRM-Enrichment/1.0"
    req["Accept"] = "text/html,application/xhtml+xml"

    res = http.request(req)
    case res
    when Net::HTTPSuccess
      body = res.body.to_s
      body = body.byteslice(0, MAX_BYTES) if body.bytesize > MAX_BYTES
      [body, uri.to_s]
    when Net::HTTPRedirection
      loc = res["location"]
      raise Error, "Invalid redirect" if loc.blank?
      next_uri = URI.join(uri, loc).to_s
      fetch_html(next_uri, redirects_left: redirects_left - 1)
    else
      raise Error, "HTTP #{res.code}"
    end
  end

  def meta_content(doc, name)
    node = doc.at("meta[property='#{name}']") || doc.at("meta[name='#{name}']")
    node&.[]("content")&.strip
  end

  def title_text(doc)
    doc.at("title")&.text&.strip&.split("|")&.first&.strip
  end

  def first_match(text, links, pattern)
    combined = [text, *links].join("\n")
    m = combined.match(pattern)
    yield m if m
  end

  def first_phone(text, links)
    combined = [text, *links].join("\n")
    tel = combined.match(/tel:([+\d\s().\-]+)/i)
    return tel[1].strip if tel

    combined.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/)&.to_s&.strip
  end

  def find_social(key, text, links)
    pattern = SOCIAL_PATTERNS[key]
    hay = [text, *links].join("\n")
    m = hay.match(pattern)
    m&.to_s&.strip
  end

  def parsed_address
    @parsed_address ||= begin
      from_structured = parse_address_from_structured_data
      if from_structured.values.any?(&:present?)
        from_structured
      else
        parse_address_from_text
      end
    end
  end

  def parse_address_from_structured_data
    scripts = @doc&.css("script[type='application/ld+json']") || []
    scripts.each do |script|
      raw = script.text.to_s.strip
      next if raw.blank?

      begin
        parsed = JSON.parse(raw)
      rescue JSON::ParserError
        next
      end
      node = find_address_node(parsed)
      next unless node.is_a?(Hash)

      return {
        street_address: node["streetAddress"].to_s.strip,
        city: node["addressLocality"].to_s.strip,
        state: node["addressRegion"].to_s.strip,
        zip: node["postalCode"].to_s.strip
      }
    end
    {}
  end

  def find_address_node(node)
    case node
    when Hash
      return node["address"] if node["address"].is_a?(Hash)
      node.each_value do |value|
        found = find_address_node(value)
        return found if found
      end
    when Array
      node.each do |value|
        found = find_address_node(value)
        return found if found
      end
    end
    nil
  end

  def parse_address_from_text
    text = @body_text.to_s.gsub(/[[:space:]]+/, " ")
    # Basic US pattern: "123 Main St, Houston, TX 77002"
    m = text.match(/(\d{1,6}\s+[A-Za-z0-9.\-# ]{2,80}),\s*([A-Za-z .'-]{2,40}),\s*([A-Z]{2}|[A-Za-z ]{4,20})\s+(\d{5}(?:-\d{4})?)/)
    return {} unless m

    {
      street_address: m[1].to_s.strip,
      city: m[2].to_s.strip,
      state: m[3].to_s.strip,
      zip: m[4].to_s.strip
    }
  end
end
