# frozen_string_literal: true

require "test_helper"

class TechnicianProfileGeocodingTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "geo-tech@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550100"
    )
  end

  test "places coordinates are stored without a second geocode request" do
    geocode_calls = 0
    GeocodingService.stub(:geocode, ->(**_) { geocode_calls += 1; [29.76, -95.36] }) do
      profile = TechnicianProfile.new(
        user: @user,
        phone: "7135550100",
        address: "100 Main St",
        city: "Houston",
        state: "Texas",
        zip_code: "77002",
        country: "United States",
        latitude: 29.7604,
        longitude: -95.3698,
        place_id: "ChIJplace"
      )
      profile.client_coordinates_provided = true
      profile.save!
      assert_equal 0, geocode_calls
      assert_in_delta 29.7604, profile.latitude, 0.0001
      assert_in_delta(-95.3698, profile.longitude, 0.0001)
      assert_equal "success", profile.geocode_status
      assert profile.map_ready?
    end
  end

  test "manual address without client coordinates invokes server geocoding" do
    geocode_calls = 0
    GeocodingService.stub(:geocode, ->(**_) { geocode_calls += 1; [30.3113, -95.456] }) do
      profile = TechnicianProfile.new(
        user: @user,
        phone: "7135550100",
        address: "1 Test St",
        city: "Conroe",
        state: "Texas",
        zip_code: "77301",
        country: "United States"
      )
      profile.save!
      assert_equal 1, geocode_calls
      assert_in_delta 30.3113, profile.latitude, 0.0001
      assert_equal "success", profile.geocode_status
    end
  end

  test "address change plus geocode failure clears stale coordinates" do
    profile = TechnicianProfile.new(
      user: @user,
      phone: "7135550100",
      address: "Old Houston St",
      city: "Houston",
      state: "Texas",
      zip_code: "77002",
      country: "United States",
      latitude: 29.7604,
      longitude: -95.3698,
      geocode_status: "success"
    )
    profile.client_coordinates_provided = true
    GeocodingService.stub(:geocode, [29.7604, -95.3698]) { profile.save! }

    GeocodingService.stub(:geocode, nil) do
      profile.assign_attributes(address: "1 Conroe St", city: "Conroe", zip_code: "77301")
      profile.client_coordinates_provided = false
      profile.save!
    end

    profile.reload
    assert_equal "Conroe", profile.city
    assert_nil profile.latitude
    assert_nil profile.longitude
    assert_equal "failed", profile.geocode_status
    refute profile.map_ready?
  end

  test "successful geocode stores new address and coordinates together" do
    profile = TechnicianProfile.new(
      user: @user,
      phone: "7135550100",
      city: "Houston",
      state: "Texas",
      country: "United States",
      latitude: 29.7604,
      longitude: -95.3698
    )
    profile.client_coordinates_provided = true
    GeocodingService.stub(:geocode, [29.7604, -95.3698]) { profile.save! }
    profile.update_columns(latitude: 29.7604, longitude: -95.3698, geocode_status: "success")

    GeocodingService.stub(:geocode, [30.3113, -95.456]) do
      profile.assign_attributes(address: "1 Conroe St", city: "Conroe", zip_code: "77301")
      profile.client_coordinates_provided = false
      profile.save!
    end

    profile.reload
    assert_equal "Conroe", profile.city
    assert_in_delta 30.3113, profile.latitude, 0.0001
    assert_in_delta(-95.456, profile.longitude, 0.0001)
    assert_equal "success", profile.geocode_status
    assert profile.map_ready?
  end

  test "zero zero coordinates are never persisted" do
    profile = TechnicianProfile.new(
      user: @user,
      phone: "7135550100",
      city: "Houston",
      state: "Texas",
      country: "United States",
      latitude: 0,
      longitude: 0
    )
    GeocodingService.stub(:geocode, [0.0, 0.0]) { profile.save! }
    profile.reload
    assert_nil profile.latitude
    assert_nil profile.longitude
    assert_equal "failed", profile.geocode_status
    refute profile.map_ready?
  end
end
