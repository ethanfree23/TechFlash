# frozen_string_literal: true

# GHL company onboarding stored business_zip_code without filling the location and state
# fields the settings page displays. Fill those only where they are still blank.
class BackfillCompanyLocationFromBusinessZip < ActiveRecord::Migration[7.1]
  def up
    CompanyProfile.reset_column_information

    CompanyProfile.where.not(business_zip_code: nil).where.not(business_zip_code: "").find_each do |profile|
      next if profile.location.present? && profile.state.present?

      profile.apply_business_zip_place!
      next unless profile.location_changed? || profile.state_changed?

      profile.update_columns(location: profile.location, state: profile.state, updated_at: Time.current)
    end
  end

  def down
    # Location and state may also have been typed in by hand, so this does not blank them.
  end
end
