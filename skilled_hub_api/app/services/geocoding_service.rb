# frozen_string_literal: true

require 'net/http'
require 'json'
require 'set'

class GeocodingService
  NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
  USER_AGENT = 'TechFlash/1.0 (contact@techflash.com)'

  US_STATE_FULL_TO_ABBR = {
    'alabama' => 'AL', 'alaska' => 'AK', 'arizona' => 'AZ', 'arkansas' => 'AR',
    'california' => 'CA', 'colorado' => 'CO', 'connecticut' => 'CT', 'delaware' => 'DE',
    'district of columbia' => 'DC', 'florida' => 'FL', 'georgia' => 'GA', 'hawaii' => 'HI',
    'idaho' => 'ID', 'illinois' => 'IL', 'indiana' => 'IN', 'iowa' => 'IA',
    'kansas' => 'KS', 'kentucky' => 'KY', 'louisiana' => 'LA', 'maine' => 'ME',
    'maryland' => 'MD', 'massachusetts' => 'MA', 'michigan' => 'MI', 'minnesota' => 'MN',
    'mississippi' => 'MS', 'missouri' => 'MO', 'montana' => 'MT', 'nebraska' => 'NE',
    'nevada' => 'NV', 'new hampshire' => 'NH', 'new jersey' => 'NJ', 'new mexico' => 'NM',
    'new york' => 'NY', 'north carolina' => 'NC', 'north dakota' => 'ND', 'ohio' => 'OH',
    'oklahoma' => 'OK', 'oregon' => 'OR', 'pennsylvania' => 'PA', 'rhode island' => 'RI',
    'south carolina' => 'SC', 'south dakota' => 'SD', 'tennessee' => 'TN', 'texas' => 'TX',
    'utah' => 'UT', 'vermont' => 'VT', 'virginia' => 'VA', 'washington' => 'WA',
    'west virginia' => 'WV', 'wisconsin' => 'WI', 'wyoming' => 'WY'
  }.freeze

  class GeocodingError < StandardError; end

  # Geocode an address and return [latitude, longitude] or nil
  def self.geocode(address:, city:, state: nil, zip_code: nil, country: nil)
    parts = [address, city, state, zip_code, country].compact.reject(&:blank?)
    return nil if parts.empty?

    query = parts.join(', ')
    uri = URI(NOMINATIM_URL)
    uri.query = URI.encode_www_form(
      q: query,
      format: 'json',
      limit: 1,
      addressdetails: 0
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 5

    request = Net::HTTP::Get.new(uri)
    request['User-Agent'] = USER_AGENT

    response = http.request(request)
    return nil unless response.is_a?(Net::HTTPSuccess)

    results = JSON.parse(response.body)
    return nil if results.empty?

    lat = results.first['lat']&.to_f
    lon = results.first['lon']&.to_f
    lat && lon ? [lat, lon] : nil
  rescue StandardError => e
    Rails.logger.warn("Geocoding failed: #{e.message}")
    nil
  end

  # Haversine formula: distance in miles between two lat/lon points
  def self.distance_miles(lat1, lon1, lat2, lon2)
    return Float::INFINITY if [lat1, lon1, lat2, lon2].any?(&:nil?)

    rad_per_deg = Math::PI / 180
    earth_radius_miles = 3959

    dlat = (lat2 - lat1) * rad_per_deg
    dlon = (lon2 - lon1) * rad_per_deg
    a = Math.sin(dlat / 2)**2 + Math.cos(lat1 * rad_per_deg) * Math.cos(lat2 * rad_per_deg) * Math.sin(dlon / 2)**2
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    earth_radius_miles * c
  end

  # US city autocomplete for admin service areas; returns [{ "label" => "Austin, TX", "city" => "...", "state" => "TX" }, ...]
  def self.city_suggestions(query)
    q = query.to_s.strip
    return [] if q.length < 2

    uri = URI(NOMINATIM_URL)
    uri.query = URI.encode_www_form(
      q: q,
      format: 'json',
      limit: 15,
      addressdetails: 1,
      countrycodes: 'us'
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 8

    request = Net::HTTP::Get.new(uri)
    request['User-Agent'] = USER_AGENT

    response = http.request(request)
    return [] unless response.is_a?(Net::HTTPSuccess)

    results = JSON.parse(response.body)
    return [] unless results.is_a?(Array)

    out = []
    seen = Set.new

    results.each do |r|
      addr = r['address'] || {}
      next unless addr['country_code'].to_s.casecmp('us').zero?

      city = addr['city'] || addr['town'] || addr['village'] || addr['hamlet'] || addr['municipality']
      state = extract_us_state_code(addr)
      next if city.blank? || state.blank?

      label = "#{city}, #{state}"
      next if seen.include?(label)

      seen.add(label)
      out << { 'label' => label, 'city' => city, 'state' => state }
      break if out.size >= 10
    end

    out
  rescue StandardError => e
    Rails.logger.warn("city_suggestions failed: #{e.message}")
    []
  end

  def self.extract_us_state_code(addr)
    iso = addr['ISO3166-2-lvl4'].to_s
    if (m = iso.match(/\AUS-([A-Z]{2})\z/i))
      return m[1].upcase
    end

    s = addr['state'].to_s.strip
    return s.upcase if s.length == 2 && s.match?(/\A[A-Za-z]{2}\z/)

    US_STATE_FULL_TO_ABBR[s.downcase]
  end

  GOOGLE_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
  GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

  def self.google_maps_api_key
    ENV["GOOGLE_MAPS_API_KEY"].presence || ENV["GOOGLE_PLACES_API_KEY"].presence
  end

  def self.address_provider
    google_maps_api_key.present? ? "google" : "nominatim"
  end

  # Job / profile address search: Google Places when key is set, else OpenStreetMap Nominatim.
  def self.address_suggestions(query)
    q = query.to_s.strip
    return [] if q.length < 3

    if google_maps_api_key.present?
      google_address_autocomplete(q)
    else
      nominatim_address_suggestions(q)
    end
  end

  def self.google_address_autocomplete(input)
    uri = URI(GOOGLE_AUTOCOMPLETE_URL)
    uri.query = URI.encode_www_form(
      input: input,
      key: google_maps_api_key,
      types: "address"
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 8

    res = http.get(uri.request_uri)
    return [] unless res.is_a?(Net::HTTPSuccess)

    body = JSON.parse(res.body)
    return [] if body["status"].present? && body["status"] != "OK" && body["status"] != "ZERO_RESULTS"

    (body["predictions"] || []).first(10).map do |p|
      {
        "source" => "google",
        "place_id" => p["place_id"],
        "label" => p["description"].to_s
      }
    end
  rescue StandardError => e
    Rails.logger.warn("google_address_autocomplete: #{e.message}")
    []
  end

  def self.google_resolve_place(place_id)
    return nil if google_maps_api_key.blank? || place_id.blank?

    uri = URI(GOOGLE_DETAILS_URL)
    uri.query = URI.encode_www_form(
      place_id: place_id,
      key: google_maps_api_key,
      fields: "address_component,formatted_address"
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 8

    res = http.get(uri.request_uri)
    return nil unless res.is_a?(Net::HTTPSuccess)

    body = JSON.parse(res.body)
    return nil unless body["status"] == "OK"

    result = body["result"]
    return nil unless result.is_a?(Hash)

    parse_google_address_components(result["address_components"] || [], result["formatted_address"])
  rescue StandardError => e
    Rails.logger.warn("google_resolve_place: #{e.message}")
    nil
  end

  def self.parse_google_address_components(components, formatted_address = nil)
    find = lambda do |type|
      c = components.find { |x| (x["types"] || []).include?(type) }
      c
    end

    street_number = find.call("street_number")&.fetch("long_name", nil)
    route = find.call("route")&.fetch("long_name", nil)
    line1 = [street_number, route].compact.reject(&:blank?).join(" ").strip

    city = find.call("locality")&.fetch("long_name", nil)
    city ||= find.call("sublocality_level_1")&.fetch("long_name", nil)
    city ||= find.call("neighborhood")&.fetch("long_name", nil)
    city ||= find.call("administrative_area_level_2")&.fetch("long_name", nil)

    state_comp = find.call("administrative_area_level_1")
    state = state_comp&.fetch("long_name", nil).presence || state_comp&.fetch("short_name", nil)

    zip = find.call("postal_code")&.fetch("long_name", nil)
    country = find.call("country")&.fetch("long_name", nil)

    return nil if line1.blank? && city.blank?

    {
      "address" => line1.presence || formatted_address.to_s.split(",").first.to_s.strip,
      "city" => city.to_s,
      "state" => state.to_s,
      "zip_code" => zip.to_s,
      "country" => country.presence || "United States",
      "formatted" => formatted_address
    }
  end

  def self.nominatim_address_suggestions(query)
    uri = URI(NOMINATIM_URL)
    uri.query = URI.encode_www_form(
      q: query,
      format: "json",
      limit: 10,
      addressdetails: 1
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 8

    request = Net::HTTP::Get.new(uri)
    request["User-Agent"] = USER_AGENT

    response = http.request(request)
    return [] unless response.is_a?(Net::HTTPSuccess)

    results = JSON.parse(response.body)
    return [] unless results.is_a?(Array)

    out = []
    seen = Set.new

    results.each do |r|
      addr = r["address"] || {}
      line1 = [addr["house_number"], addr["road"]].compact.reject(&:blank?).join(" ").strip
      city = addr["city"] || addr["town"] || addr["village"] || addr["hamlet"] || addr["municipality"]
      next if line1.blank? && city.blank?

      state_str = nominatim_state_display(addr)
      country = addr["country"].presence || country_name_from_code(addr["country_code"])
      zip = addr["postcode"].to_s
      label = r["display_name"].to_s
      next if label.blank? || seen.include?(label)

      seen.add(label)
      out << {
        "source" => "nominatim",
        "label" => label,
        "address" => line1.presence || label.split(",").first.to_s.strip,
        "city" => city.to_s,
        "state" => state_str.to_s,
        "zip_code" => zip,
        "country" => country.to_s
      }
      break if out.size >= 8
    end

    out
  rescue StandardError => e
    Rails.logger.warn("nominatim_address_suggestions: #{e.message}")
    []
  end

  def self.nominatim_state_display(addr)
    cc = addr["country_code"].to_s.downcase
    if cc == "us"
      abbr = extract_us_state_code(addr)
      return us_full_state_name_from_abbr(abbr) if abbr.present?
    end

    addr["state"].to_s.presence || addr["region"].to_s
  end

  def self.us_full_state_name_from_abbr(abbr)
    code = abbr.to_s.strip.upcase
    return abbr.to_s if code.length != 2

    US_STATE_FULL_TO_ABBR.each do |full_lower, short|
      return full_lower.split.map(&:capitalize).join(" ") if short == code
    end
    abbr.to_s
  end

  def self.country_name_from_code(code)
    c = code.to_s.downcase
    {
      "us" => "United States",
      "gb" => "United Kingdom",
      "ca" => "Canada",
      "mx" => "Mexico",
      "au" => "Australia",
      "de" => "Germany",
      "fr" => "France",
      "it" => "Italy",
      "es" => "Spain",
      "br" => "Brazil",
      "in" => "India"
    }[c] || code.to_s.upcase
  end
end
