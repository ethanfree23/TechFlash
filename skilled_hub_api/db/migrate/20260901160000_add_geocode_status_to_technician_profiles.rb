# frozen_string_literal: true

class AddGeocodeStatusToTechnicianProfiles < ActiveRecord::Migration[7.1]
  def up
    add_column :technician_profiles, :geocode_status, :string
    add_column :technician_profiles, :geocoded_at, :datetime
    add_column :technician_profiles, :place_id, :string
    add_index :technician_profiles, :geocode_status

    say_with_time "backfill technician_profiles.geocode_status" do
      TechnicianProfile.reset_column_information
      TechnicianProfile.find_each do |profile|
        result = CoordinateValidator.pair(profile.latitude, profile.longitude, country: profile.country)
        status =
          if result.valid?
            "success"
          elsif profile.latitude.nil? && profile.longitude.nil?
            "pending"
          else
            "failed"
          end
        profile.update_columns(geocode_status: status)
      end
    end
  end

  def down
    remove_index :technician_profiles, :geocode_status
    remove_column :technician_profiles, :place_id
    remove_column :technician_profiles, :geocoded_at
    remove_column :technician_profiles, :geocode_status
  end
end
