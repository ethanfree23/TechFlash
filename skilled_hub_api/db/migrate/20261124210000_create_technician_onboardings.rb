# frozen_string_literal: true

class CreateTechnicianOnboardings < ActiveRecord::Migration[7.1]
  def change
    create_table :technician_onboardings do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :status, null: false, default: "not_started"
      t.string :current_section
      t.string :current_substep
      t.json :completed_sections, null: false, default: []
      t.json :section_statuses, null: false, default: {}
      t.integer :onboarding_version, null: false, default: 1
      t.datetime :started_at
      t.datetime :completed_at
      t.datetime :last_activity_at
      t.datetime :grandfathered_at
      t.string :grandfather_reason
      t.datetime :required_by_admin_at
      t.integer :required_by_admin_id
      t.datetime :assessment_prompt_sent_at
      t.datetime :assessment_reminder_sent_at
      t.boolean :welcome_banner_dismissed, null: false, default: false
      t.json :metadata, null: false, default: {}

      t.timestamps
    end

    add_index :technician_onboardings, :status
    add_index :technician_onboardings, :completed_at
    add_index :technician_onboardings, :required_by_admin_at
    add_foreign_key :technician_onboardings, :users, column: :required_by_admin_id
  end
end
