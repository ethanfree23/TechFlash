# frozen_string_literal: true

class BackfillPremiumBackgroundCheckWaiver < ActiveRecord::Migration[7.1]
  def up
    MembershipTierConfig.where(audience: "technician", slug: "premium").update_all(waives_background_check_fee: true)
  end

  def down
    MembershipTierConfig.where(audience: "technician", slug: "premium").update_all(waives_background_check_fee: false)
  end
end
