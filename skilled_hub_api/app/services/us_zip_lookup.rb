# frozen_string_literal: true

require "json"
require "zlib"

# Offline ZIP → city/state, plus Census 2024 ZCTA internal points for distance.
# Centroids live in db/data/us_zip_centroids.json.gz as { "79901" => [lat, lng] }.
# PO Box and unique ZIPs often have no geographic centroid.
class UsZipLookup
  DATA_PATH = Rails.root.join("db/data/us_zips.json.gz")
  CENTROIDS_PATH = Rails.root.join("db/data/us_zip_centroids.json.gz")

  class << self
    def place_for(zip)
      zip5 = GeocodingService.normalized_us_zip(zip)
      return nil if zip5.blank?

      row = table[zip5]
      return nil unless row.is_a?(Array)

      city = row[0].to_s.strip
      state = row[1].to_s.strip.upcase
      return nil if city.blank? || state.length != 2

      { city: city, state: state }
    end

    def fill(city:, state:, zip_code:)
      place = place_for(zip_code)
      filled_city = city.to_s.strip.presence || place&.dig(:city)
      filled_state = state.to_s.strip.presence || place&.dig(:state)
      [filled_city, filled_state]
    end

    # [latitude, longitude] for a ZIP centroid, or nil when this ZIP has no map point.
    def coordinates_for(zip)
      zip5 = GeocodingService.normalized_us_zip(zip)
      return nil if zip5.blank?

      row = centroids[zip5]
      return nil unless row.is_a?(Array) && row.size >= 2

      pair = CoordinateValidator.pair(row[0], row[1], country: "United States")
      return nil unless pair.valid?

      [pair.latitude, pair.longitude]
    end

    def reset!
      @table = nil
      @centroids = nil
    end

    def table
      @table ||= load_json(DATA_PATH)
    end

    def centroids
      @centroids ||= load_json(CENTROIDS_PATH)
    end

    private

    def load_json(path)
      return {} unless File.exist?(path)

      raw = Zlib::GzipReader.open(path, &:read)
      JSON.parse(raw)
    rescue StandardError => e
      Rails.logger.warn("UsZipLookup failed to load #{path}: #{e.message}")
      {}
    end
  end
end
