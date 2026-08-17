# frozen_string_literal: true

class AddBackgroundCheckFeeWaiverToTiers < ActiveRecord::Migration[7.1]
  def change
    add_column :membership_tier_configs, :waives_background_check_fee, :boolean, default: false, null: false
  end
end
