class AddBackgroundVerifiedToTechnicianProfiles < ActiveRecord::Migration[7.1]
  def change
    add_column :technician_profiles, :background_verified, :boolean, default: false, null: false
  end
end
