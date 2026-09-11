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
end
