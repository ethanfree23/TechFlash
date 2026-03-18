# frozen_string_literal: true

require 'net/http'
require 'json'

class GeocodingService
  NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
  USER_AGENT = 'TechFlash/1.0 (contact@techflash.com)'

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
end
