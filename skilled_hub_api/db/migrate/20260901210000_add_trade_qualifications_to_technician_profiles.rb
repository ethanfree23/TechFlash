# frozen_string_literal: true

class AddTradeQualificationsToTechnicianProfiles < ActiveRecord::Migration[7.1]
  def up
    quals_type = connection.adapter_name == "PostgreSQL" ? :jsonb : :json
    add_column :technician_profiles, :trade_qualifications, quals_type, default: [], null: false

    say_with_time "backfill technician_profiles.trade_qualifications" do
      TechnicianProfile.reset_column_information
      TechnicianProfile.find_each do |profile|
        quals = TradeQualificationNormalizer.from_scalars(
          trade_type: profile.trade_type,
          skill_class: profile.skill_class,
          experience_years: profile.experience_years,
          specialties: profile.specialties
        )
        profile.update_columns(trade_qualifications: quals.as_json)
      end
    end
  end

  def down
    remove_column :technician_profiles, :trade_qualifications
  end
end
