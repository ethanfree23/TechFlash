# frozen_string_literal: true

class AddSkillClassToTechnicianProfiles < ActiveRecord::Migration[7.1]
  def change
    add_column :technician_profiles, :skill_class, :string
  end
end
