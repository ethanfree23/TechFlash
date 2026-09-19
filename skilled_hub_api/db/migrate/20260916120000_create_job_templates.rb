# frozen_string_literal: true

class CreateJobTemplates < ActiveRecord::Migration[7.1]
  def change
    create_table :job_templates do |t|
      t.references :company_profile, null: false, foreign_key: true
      t.references :created_by_user, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :trade_type
      t.string :skill_class
      # Reusable job attributes, keyed by Job column name. A JSON payload keeps the
      # template in step with the Job schema without a migration per new job field.
      t.json :configuration, default: {}, null: false
      t.integer :use_count, default: 0, null: false
      t.datetime :last_used_at
      t.timestamps
    end

    add_index :job_templates, [:company_profile_id, :name]
    add_index :job_templates, [:company_profile_id, :updated_at]
  end
end
