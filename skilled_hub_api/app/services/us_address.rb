# frozen_string_literal: true

# US-only address helpers. Country is never part of a display location.
class UsAddress
  COUNTRY_TAIL = /,?\s*(?:United States(?: of America)?|U\.S\.A\.?|U\.S\.|USA|US)\s*\z/i

  class << self
    def strip_country(text)
      text.to_s.gsub(COUNTRY_TAIL, "").sub(/[,\s]+\z/, "").strip
    end

    def state_abbreviation(state)
      GeocodingService.us_state_abbreviation(state).to_s.presence
    end

    def parse_city_state(location)
      cleaned = strip_country(location)
      return empty if cleaned.blank?

      if state_only?(cleaned)
        return { city: nil, state: state_abbreviation(cleaned) }
      end

      if (m = cleaned.match(/\A(.+),\s*([^,]+)\z/))
        city = m[1].to_s.strip
        state_raw = m[2].to_s.strip.sub(/\s+\d{5}(?:-\d{4})?\z/, "").strip
        abbr = state_abbreviation(state_raw)
        if abbr.present? && abbr.match?(/\A[A-Z]{2}\z/)
          return { city: city.presence, state: abbr }
        end
      end

      { city: cleaned, state: nil }
    end

    private

    def empty
      { city: nil, state: nil }
    end

    def state_only?(value)
      s = value.to_s.strip
      return false if s.include?(",")

      abbr = state_abbreviation(s)
      return false if abbr.blank? || !abbr.match?(/\A[A-Z]{2}\z/)
      return true if s.match?(/\A[A-Za-z]{2}\z/)

      GeocodingService::US_STATE_FULL_TO_ABBR.key?(s.downcase)
    end
  end
end
