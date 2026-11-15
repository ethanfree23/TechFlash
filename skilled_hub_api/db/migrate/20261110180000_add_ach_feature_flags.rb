# frozen_string_literal: true

class AddAchFeatureFlags < ActiveRecord::Migration[7.0]
  def change
    add_column :company_profiles, :ach_payments_enabled, :boolean, null: false, default: false
    add_index :company_profiles, :ach_payments_enabled

    create_table :ach_feature_audits do |t|
      t.string :scope, null: false # "global" | "company"
      t.integer :company_profile_id
      t.integer :actor_user_id
      t.string :actor_email
      t.boolean :old_value
      t.boolean :new_value, null: false
      t.string :source, default: "admin", null: false
      t.json :metadata_json, default: {}, null: false
      t.timestamps
    end
    add_index :ach_feature_audits, :company_profile_id
    add_index :ach_feature_audits, :created_at
    add_index :ach_feature_audits, :scope
  end
end
