# frozen_string_literal: true

require "test_helper"

class UsZipLookupTest < ActiveSupport::TestCase
  test "place_for returns city and state for a known US zip" do
    place = UsZipLookup.place_for("77002")
    assert_equal "Houston", place[:city]
    assert_equal "TX", place[:state]
  end

  test "fill keeps existing city and state" do
    city, state = UsZipLookup.fill(city: "Conroe", state: "Texas", zip_code: "77002")
    assert_equal "Conroe", city
    assert_equal "Texas", state
  end

  test "fill supplies missing city and state from zip" do
    city, state = UsZipLookup.fill(city: "", state: nil, zip_code: "38103")
    assert_equal "Memphis", city
    assert_equal "TN", state
  end

  test "coordinates_for returns a centroid for El Paso and Houston" do
    el_paso = UsZipLookup.coordinates_for("79901")
    houston = UsZipLookup.coordinates_for("77002-1234")

    assert_in_delta 31.76, el_paso[0], 0.2
    assert_in_delta(-106.48, el_paso[1], 0.2)
    assert_in_delta 29.76, houston[0], 0.2
    assert_in_delta(-95.37, houston[1], 0.2)
    assert_operator GeocodingService.distance_miles(*el_paso, *houston), :>, 500
  end

  test "coordinates_for is nil for a blank or non-geographic zip" do
    assert_nil UsZipLookup.coordinates_for("")
    assert_nil UsZipLookup.coordinates_for("10008")
  end
end
