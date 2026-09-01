# frozen_string_literal: true

# Shared lat/lng validation. Do not use Numeric#blank? — in Rails 7.1, 0.blank? is false.
class CoordinateValidator
  NULL_ISLAND_EPSILON = 0.05
  US_LAT_MIN = -16.0
  US_LAT_MAX = 72.0

  Result = Struct.new(:latitude, :longitude, :reason, keyword_init: true) do
    def valid?
      reason.nil?
    end
  end

  def self.pair(lat, lng, country: nil)
    lat_n = parse_number(lat)
    lng_n = parse_number(lng)

    if lat_n.nil? && lng_n.nil?
      return Result.new(reason: :coordinates_missing)
    end
    if lat_n.nil? || lng_n.nil?
      return Result.new(reason: :incomplete_pair)
    end
    if lat_n < -90 || lat_n > 90
      return Result.new(reason: :latitude_invalid)
    end
    if lng_n < -180 || lng_n > 180
      return Result.new(reason: :longitude_invalid)
    end
    if lat_n.abs < NULL_ISLAND_EPSILON && lng_n.abs < NULL_ISLAND_EPSILON
      return Result.new(reason: :null_island)
    end
    if us_country?(country) && !us_plausible?(lat_n, lng_n)
      return Result.new(reason: :outside_us)
    end

    Result.new(latitude: lat_n, longitude: lng_n)
  end

  def self.valid?(lat, lng, country: nil)
    pair(lat, lng, country: country).valid?
  end

  def self.parse_number(value)
    return nil if value.nil?
    if value.is_a?(String)
      s = value.strip
      return nil if s.empty?
      return nil unless s.match?(/\A[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\z/)
      f = Float(s)
    elsif value.is_a?(Numeric)
      f = Float(value)
    else
      return nil
    end
    return nil unless f.finite?

    f
  rescue ArgumentError, TypeError, FloatDomainError
    nil
  end

  def self.us_country?(country)
    c = country.to_s.strip.downcase
    return false if c.empty?

    %w[us usa united\ states united\ states\ of\ america u.s. u.s.a.].include?(c)
  end

  def self.us_plausible?(lat, lng)
    return false if lat < US_LAT_MIN || lat > US_LAT_MAX

    lng <= -64.0 || lng >= 144.0
  end
end
