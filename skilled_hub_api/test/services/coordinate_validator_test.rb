# frozen_string_literal: true

require "test_helper"

class CoordinateValidatorTest < ActiveSupport::TestCase
  test "Rails Numeric#blank? is false for zero" do
    assert_equal false, 0.blank?
    assert_equal false, 0.0.blank?
    assert_equal true, 0.present?
  end

  test "nil pair is missing not zero" do
    result = CoordinateValidator.pair(nil, nil)
    refute result.valid?
    assert_equal :coordinates_missing, result.reason
  end

  test "blank strings are missing" do
    result = CoordinateValidator.pair("", "  ")
    refute result.valid?
    assert_equal :coordinates_missing, result.reason
  end

  test "nil.to_f style values are rejected as null island" do
    result = CoordinateValidator.pair(nil.to_f, nil.to_f)
    refute result.valid?
    assert_equal :null_island, result.reason
  end

  test "malformed strings are rejected" do
    result = CoordinateValidator.pair("not-a-number", "-95.4")
    refute result.valid?
  end

  test "zero zero is null island" do
    result = CoordinateValidator.pair(0, 0)
    refute result.valid?
    assert_equal :null_island, result.reason
  end

  test "valid Texas coordinates pass" do
    result = CoordinateValidator.pair("30.3113", "-95.4560", country: "United States")
    assert result.valid?
    assert_in_delta 30.3113, result.latitude, 0.0001
    assert_in_delta(-95.4560, result.longitude, 0.0001)
  end

  test "Alaska, Hawaii, and Puerto Rico remain valid US coordinates" do
    assert CoordinateValidator.valid?(61.2181, -149.9003, country: "United States")
    assert CoordinateValidator.valid?(21.3069, -157.8583, country: "United States")
    assert CoordinateValidator.valid?(18.2208, -66.5901, country: "United States")
  end

  test "London is rejected for United States country" do
    result = CoordinateValidator.pair(51.5074, -0.1278, country: "United States")
    refute result.valid?
    assert_equal :outside_us, result.reason
  end
end
