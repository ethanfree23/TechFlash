class CreateJobTerminations < ActiveRecord::Migration[7.1]
  def change
    unless column_exists?(:jobs, :terminated_at)
      add_column :jobs, :terminated_at, :datetime
    end
    add_index :jobs, :terminated_at unless index_exists?(:jobs, :terminated_at)

    return if table_exists?(:job_terminations)

    create_table :job_terminations do |t|
      t.references :job, null: false, foreign_key: true, index: { unique: true }
      t.references :job_application, foreign_key: true
      t.references :technician_profile, foreign_key: true
      t.references :initiated_by_user, null: false, foreign_key: { to_table: :users }
      t.integer :initiated_by_role, null: false, default: 0
      t.integer :reason, null: false, default: 0
      t.text :notes

      t.datetime :terminated_at, null: false
      t.datetime :effective_end_at, null: false
      t.date :last_worked_on_date

      t.datetime :original_scheduled_start_at
      t.datetime :original_scheduled_end_at
      t.decimal :original_estimated_hours, precision: 10, scale: 2
      t.integer :original_agreed_labor_cents
      t.integer :original_net_funded_cents
      t.integer :original_company_required_cents
      t.integer :pay_basis, null: false, default: 0

      t.decimal :approved_hours, precision: 8, scale: 2, null: false, default: 0
      t.integer :approved_gross_labor_cents, null: false, default: 0
      t.decimal :rejected_hours, precision: 8, scale: 2, null: false, default: 0
      t.decimal :canceled_scheduled_hours, precision: 8, scale: 2
      t.boolean :work_performed, null: false, default: false
      t.boolean :zero_hour_termination, null: false, default: false

      t.integer :refund_cents
      t.integer :technician_payout_cents
      t.string :settlement_status
      t.text :settlement_error
      t.json :settlement_result, null: false, default: {}

      t.timestamps
    end

    add_index :job_terminations, :reason
    add_index :job_terminations, :terminated_at
  end
end
