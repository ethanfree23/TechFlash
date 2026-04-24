class AddMembershipsToProfiles < ActiveRecord::Migration[7.1]
  def change
    add_column :company_profiles, :membership_level, :string, null: false, default: "basic"
    add_column :company_profiles, :membership_fee_override_cents, :integer
    add_column :company_profiles, :commission_override_percent, :decimal, precision: 5, scale: 2
    add_column :company_profiles, :membership_fee_waived, :boolean, null: false, default: false
    add_column :company_profiles, :stripe_membership_subscription_id, :string
    add_column :company_profiles, :membership_status, :string
    add_column :company_profiles, :membership_current_period_end_at, :datetime

    add_column :technician_profiles, :membership_level, :string, null: false, default: "basic"
    add_column :technician_profiles, :membership_fee_override_cents, :integer
    add_column :technician_profiles, :commission_override_percent, :decimal, precision: 5, scale: 2
    add_column :technician_profiles, :membership_fee_waived, :boolean, null: false, default: false
    add_column :technician_profiles, :stripe_membership_subscription_id, :string
    add_column :technician_profiles, :membership_status, :string
    add_column :technician_profiles, :membership_current_period_end_at, :datetime

    add_index :company_profiles, :membership_level
    add_index :technician_profiles, :membership_level
    add_index :company_profiles, :stripe_membership_subscription_id, unique: true
    add_index :technician_profiles, :stripe_membership_subscription_id, unique: true
  end
end
