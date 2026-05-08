require "openssl"

class MapPrivacyService
  EARTH_MILES_PER_LAT_DEGREE = 69.0
  DEFAULT_MIN_RADIUS_MILES = 0.7
  DEFAULT_MAX_RADIUS_MILES = 2.2

  def self.blurred_coordinates(latitude:, longitude:, seed_key:)
    return [latitude, longitude] if latitude.blank? || longitude.blank?

    seed = OpenSSL::HMAC.hexdigest("SHA256", Rails.application.secret_key_base, seed_key.to_s)
    angle = seed[0, 8].to_i(16) / 0xFFFFFFFF.to_f * 2.0 * Math::PI
    distance = DEFAULT_MIN_RADIUS_MILES + (seed[8, 8].to_i(16) / 0xFFFFFFFF.to_f) * (DEFAULT_MAX_RADIUS_MILES - DEFAULT_MIN_RADIUS_MILES)

    lat_offset = (distance / EARTH_MILES_PER_LAT_DEGREE) * Math.cos(angle)
    lng_divisor = [EARTH_MILES_PER_LAT_DEGREE * Math.cos(latitude.to_f * Math::PI / 180.0).abs, 1e-6].max
    lng_offset = (distance / lng_divisor) * Math.sin(angle)

    [latitude.to_f + lat_offset, longitude.to_f + lng_offset]
  end
end
