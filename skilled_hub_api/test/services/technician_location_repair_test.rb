# frozen_string_literal: true

require "test_helper"

class TechnicianLocationRepairTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(
      email: "repair-tech@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550199"
    )
    @profile = TechnicianProfile.new(user: @user, phone: "7135550199", city: "Houston", state: "Texas", country: "United States")
    @profile.client_coordinates_provided = true
    @profile.latitude = 0
    @profile.longitude = 0
    GeocodingService.stub(:geocode, nil) { @profile.save(validate: false) }
    @profile.update_columns(latitude: 0, longitude: 0, geocode_status: "failed")
  end

  test "audit is read-only" do
    before = @profile.reload.attributes.slice("latitude", "longitude", "geocode_status")
    geocode_calls = 0
    GeocodingService.stub(:geocode, ->(**_) { geocode_calls += 1; [30.3113, -95.456] }) do
      rows = TechnicianLocationRepair.audit
      assert rows.any? { |row| row.technician_profile_id == @profile.id && row.reason == :null_island }
    end
    assert_equal 0, geocode_calls
    after = @profile.reload.attributes.slice("latitude", "longitude", "geocode_status")
    assert_equal before, after
  end

  test "repair dry run does not write" do
    before = @profile.reload.attributes.slice("latitude", "longitude", "geocode_status")
    GeocodingService.stub(:geocode, [30.3113, -95.456]) do
      TechnicianLocationRepair.repair!(dry_run: true, force: false)
    end
    after = @profile.reload.attributes.slice("latitude", "longitude", "geocode_status")
    assert_equal before, after
  end

  test "repair does not overwrite valid coordinates by default" do
    valid_user = User.create!(
      email: "valid-repair@example.com",
      password: "password123",
      password_confirmation: "password123",
      role: :technician,
      phone: "7135550200"
    )
    valid = TechnicianProfile.new(
      user: valid_user,
      phone: "7135550200",
      city: "Conroe",
      state: "Texas",
      country: "United States",
      latitude: 30.3113,
      longitude: -95.456
    )
    valid.client_coordinates_provided = true
    GeocodingService.stub(:geocode, [30.3113, -95.456]) { valid.save! }

    GeocodingService.stub(:geocode, [29.76, -95.36]) do
      TechnicianLocationRepair.repair!(dry_run: false, force: false)
    end

    valid.reload
    assert_in_delta 30.3113, valid.latitude, 0.0001
    assert_in_delta(-95.456, valid.longitude, 0.0001)
  end
end
