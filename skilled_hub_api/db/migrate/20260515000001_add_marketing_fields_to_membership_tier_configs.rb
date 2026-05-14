# frozen_string_literal: true

class AddMarketingFieldsToMembershipTierConfigs < ActiveRecord::Migration[7.1]
  def change
    # SQLite has no jsonb; PostgreSQL prefers jsonb for indexed JSON. Use adapter-appropriate type.
    feature_type = connection.adapter_name == 'PostgreSQL' ? :jsonb : :json

    change_table :membership_tier_configs, bulk: true do |t|
      t.integer :yearly_fee_cents, default: 0, null: false
      t.string :yearly_savings_label
      t.column :feature_bullets, feature_type, default: [], null: false
      t.text :job_access_summary
      t.text :commission_summary
      t.boolean :is_highlighted, default: false, null: false
      t.boolean :active, default: true, null: false
    end
  end
end
