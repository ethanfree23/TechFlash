# frozen_string_literal: true

class ReclassifyTripletDieselAsAutoShop < ActiveRecord::Migration[7.1]
  AUTO_TRADE = "Automobile Technician"
  COMPANY_NAME = "triplet diesel"

  def up
    profile = CompanyProfile.where("LOWER(TRIM(company_name)) = ?", COMPANY_NAME).first
    return if profile.blank?

    profile.update_columns(
      industry: "Auto Shop",
      service_trades: [AUTO_TRADE],
      updated_at: Time.current
    )

    open_statuses = [
      Job.statuses[:open],
      Job.statuses[:pending_funding]
    ]
    Job.where(company_profile_id: profile.id)
      .where("status IN (?) OR id = ?", open_statuses, 31)
      .update_all(trade_type: AUTO_TRADE, updated_at: Time.current)
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
