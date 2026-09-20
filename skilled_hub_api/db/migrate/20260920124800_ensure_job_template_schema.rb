# frozen_string_literal: true

# Job-template migrations originally used 20260916120000-20200, the same versions as
# assessment migrations. If a database applied the assessment files first, those
# versions are already in schema_migrations and the job-template files would never
# run. Create anything still missing.
class EnsureJobTemplateSchema < ActiveRecord::Migration[7.1]
  FLEXIBLE_START = 0
  HARD_END = 1

  def up
    create_job_templates_if_needed
    add_potential_full_time_if_needed
    add_schedule_flexibility_if_needed
  end

  def down
    # Original migrations own rollback for these objects.
  end

  private

  def create_job_templates_if_needed
    return if table_exists?(:job_templates)

    create_table :job_templates do |t|
      t.references :company_profile, null: false, foreign_key: true
      t.references :created_by_user, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :trade_type
      t.string :skill_class
      t.json :configuration, default: {}, null: false
      t.integer :use_count, default: 0, null: false
      t.datetime :last_used_at
      t.timestamps
    end

    add_index :job_templates, [:company_profile_id, :name]
    add_index :job_templates, [:company_profile_id, :updated_at]
  end

  def add_potential_full_time_if_needed
    unless column_exists?(:jobs, :potential_full_time)
      add_column :jobs, :potential_full_time, :boolean, default: false, null: false
    end
    unless column_exists?(:jobs, :potential_full_time_details)
      add_column :jobs, :potential_full_time_details, :json, default: {}, null: false
    end
    add_index :jobs, :potential_full_time unless index_exists?(:jobs, :potential_full_time)
  end

  def add_schedule_flexibility_if_needed
    unless column_exists?(:jobs, :schedule_flexibility)
      add_column :jobs, :schedule_flexibility, :integer, default: FLEXIBLE_START, null: false
    end
    add_index :jobs, :schedule_flexibility unless index_exists?(:jobs, :schedule_flexibility)

    return unless column_exists?(:jobs, :hard_deadline_at)

    execute <<~SQL.squish
      UPDATE jobs SET schedule_flexibility = #{HARD_END} WHERE hard_deadline_at IS NOT NULL
    SQL
  end
end
