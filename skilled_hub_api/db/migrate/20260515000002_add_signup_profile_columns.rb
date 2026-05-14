# frozen_string_literal: true

class AddSignupProfileColumns < ActiveRecord::Migration[7.1]
  def change
    add_column :company_profiles, :primary_hiring_need, :string
    specialties_type = connection.adapter_name == 'PostgreSQL' ? :jsonb : :json
    add_column :technician_profiles, :specialties, specialties_type, default: [], null: false
  end
end
