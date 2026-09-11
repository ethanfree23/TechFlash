# frozen_string_literal: true

require "test_helper"

class UsAddressTest < ActiveSupport::TestCase
  test "strip_country removes trailing US labels" do
    assert_equal "Houston, TX", UsAddress.strip_country("Houston, TX, United States")
    assert_equal "Memphis, TN", UsAddress.strip_country("Memphis, TN, USA")
    assert_equal "Texas", UsAddress.strip_country("Texas, United States")
  end

  test "parse_city_state splits city and state and ignores country" do
    assert_equal({ city: "Houston", state: "TX" }, UsAddress.parse_city_state("Houston, TX, United States"))
    assert_equal({ city: nil, state: "TX" }, UsAddress.parse_city_state("Texas, United States"))
    assert_equal({ city: "Memphis", state: "TN" }, UsAddress.parse_city_state("Memphis, Tennessee"))
  end
end
