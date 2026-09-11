# frozen_string_literal: true

require "json"
require "zlib"

# Offline ZIP → city/state for US postal codes.
class UsZipLookup
  DATA_PATH = Rails.root.join("db/data/us_zips.json.gz")

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

    def reset!
      @table = nil
    end

    def table
      @table ||= load_table
    end

    private

    def load_table
      return {} unless File.exist?(DATA_PATH)

      raw = Zlib::GzipReader.open(DATA_PATH, &:read)
      JSON.parse(raw)
    rescue StandardError => e
      Rails.logger.warn("UsZipLookup failed to load: #{e.message}")
      {}
    end
  end
end
