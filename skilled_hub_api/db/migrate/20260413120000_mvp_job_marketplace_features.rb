# frozen_string_literal: true

class MvpJobMarketplaceFeatures < ActiveRecord::Migration[7.1]
  def change
    create_table :job_issue_reports do |t|
      t.references :job, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :category, default: 'general'
      t.text :body, null: false
      t.timestamps
    end

    create_table :saved_job_searches do |t|
      t.references :technician_profile, null: false, foreign_key: true
      t.string :keyword
      t.string :location
      t.string :skill_class
      t.timestamps
    end
    add_index :saved_job_searches, [:technician_profile_id, :keyword, :location, :skill_class],
              unique: true, name: 'index_saved_searches_on_tech_and_criteria'

    create_table :favorite_technicians do |t|
      t.references :company_profile, null: false, foreign_key: true
      t.references :technician_profile, null: false, foreign_key: true
      t.timestamps
    end
    add_index :favorite_technicians, [:company_profile_id, :technician_profile_id],
              unique: true, name: 'index_favorites_company_tech_unique'

    create_table :stripe_webhook_events do |t|
      t.string :stripe_event_id, null: false
      t.string :event_type
      t.text :payload
      t.datetime :processed_at
      t.timestamps
    end
    add_index :stripe_webhook_events, :stripe_event_id, unique: true
  end
end
