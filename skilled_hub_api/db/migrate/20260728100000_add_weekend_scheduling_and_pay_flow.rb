class AddWeekendSchedulingAndPayFlow < ActiveRecord::Migration[7.1]
  def change
    change_table :jobs, bulk: true do |t|
      t.integer :weekend_work_policy, null: false, default: 0
      t.json :standard_work_days, null: false, default: [1, 2, 3, 4, 5]
      t.integer :saturday_work_policy, null: false, default: 0
      t.integer :sunday_work_policy, null: false, default: 0
      t.decimal :saturday_multiplier, precision: 3, scale: 1
      t.decimal :sunday_multiplier, precision: 3, scale: 1
      t.boolean :weekend_requires_company_approval, null: false, default: true
      t.boolean :weekend_requires_technician_acceptance, null: false, default: true
      t.integer :premium_combination_rule, null: false, default: 0
      t.boolean :overtime_enabled, null: false, default: false
      t.decimal :daily_overtime_threshold_hours, precision: 5, scale: 2
      t.decimal :weekly_overtime_threshold_hours, precision: 5, scale: 2
      t.decimal :overtime_multiplier, precision: 3, scale: 1
      t.datetime :hard_deadline_at
      t.string :job_timezone, null: false, default: "UTC"
      t.json :standard_day_shifts, null: false, default: {}
      t.json :weekend_day_shifts, null: false, default: {}
    end

    create_table :weekend_work_requests do |t|
      t.references :job, null: false, foreign_key: true
      t.references :technician_profile, null: false, foreign_key: true
      t.references :requested_by_user, null: false, foreign_key: { to_table: :users }
      t.integer :status, null: false, default: 0
      t.date :requested_date, null: false
      t.datetime :requested_start_at, null: false
      t.datetime :requested_end_at, null: false
      t.decimal :estimated_hours, precision: 5, scale: 2, null: false
      t.decimal :applicable_multiplier, precision: 3, scale: 1, null: false, default: 1.0
      t.text :company_note
      t.text :technician_response_note
      t.datetime :responded_at
      t.datetime :cancelled_at
      t.datetime :completed_at
      t.timestamps
    end

    add_index :weekend_work_requests, [:job_id, :status]
    add_index :weekend_work_requests, [:job_id, :requested_date]

    create_table :time_entries do |t|
      t.references :job, null: false, foreign_key: true
      t.references :technician_profile, null: false, foreign_key: true
      t.references :weekend_work_request, foreign_key: true
      t.references :submitted_by_user, null: false, foreign_key: { to_table: :users }
      t.references :approved_by_user, foreign_key: { to_table: :users }
      t.integer :status, null: false, default: 0
      t.datetime :worked_start_at, null: false
      t.datetime :worked_end_at, null: false
      t.date :worked_on_date, null: false
      t.decimal :worked_hours, precision: 6, scale: 2, null: false
      t.string :job_timezone, null: false, default: "UTC"
      t.boolean :override_applied, null: false, default: false
      t.text :override_reason
      t.references :override_by_user, foreign_key: { to_table: :users }
      t.datetime :approved_at
      t.datetime :paid_at
      t.timestamps
    end

    add_index :time_entries, [:job_id, :worked_on_date]
    add_index :time_entries, [:job_id, :status]

    create_table :time_entry_pay_lines do |t|
      t.references :time_entry, null: false, foreign_key: true
      t.references :job, null: false, foreign_key: true
      t.integer :base_hourly_rate_cents, null: false
      t.decimal :overtime_multiplier, precision: 3, scale: 1
      t.decimal :weekend_multiplier, precision: 3, scale: 1
      t.decimal :applied_multiplier, precision: 3, scale: 1, null: false
      t.integer :effective_hourly_rate_cents, null: false
      t.decimal :worked_hours, precision: 6, scale: 2, null: false
      t.integer :gross_pay_cents, null: false
      t.integer :premium_combination_rule, null: false, default: 0
      t.json :calculation_details, null: false, default: {}
      t.timestamps
    end

    create_table :job_term_change_audits do |t|
      t.references :job, null: false, foreign_key: true
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.string :change_type, null: false
      t.text :reason
      t.json :previous_values, null: false, default: {}
      t.json :new_values, null: false, default: {}
      t.boolean :requires_technician_acknowledgement, null: false, default: false
      t.datetime :acknowledged_at
      t.timestamps
    end

    add_index :job_term_change_audits, [:job_id, :created_at]
    add_index :job_term_change_audits, :change_type
  end
end
