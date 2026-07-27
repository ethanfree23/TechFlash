class AddConsentFieldsToBackgroundChecks < ActiveRecord::Migration[7.1]
  def change
    add_column :background_checks, :disclosure_accepted_at, :datetime
    add_column :background_checks, :authorization_accepted_at, :datetime
    add_column :background_checks, :consent_ip, :string
  end
end
