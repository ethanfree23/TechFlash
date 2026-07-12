class ExtendBackgroundChecksForCheckrHostedApply < ActiveRecord::Migration[7.1]
  def up
    change_table :background_checks, bulk: true do |t|
      t.string :normalized_status
      t.string :provider_status
      t.string :provider_assess_status
      t.text :invitation_url
      t.string :node_custom_id
      t.string :work_location_country
      t.string :work_location_state
      t.string :work_location_city
      t.datetime :report_eta_at
      t.string :report_url
      t.string :dashboard_url
      t.string :last_webhook_event_id
      t.references :job, foreign_key: true, null: true
      t.references :job_application, foreign_key: true, null: true
      t.references :company_profile, foreign_key: true, null: true
    end

    add_index :background_checks, :normalized_status
    add_index :background_checks, :last_webhook_event_id
    add_index :background_checks, :node_custom_id

    execute <<~SQL.squish
      UPDATE background_checks
      SET normalized_status = CASE status
        WHEN 0 THEN 'not_started'
        WHEN 1 THEN 'invitation_sent'
        WHEN 2 THEN 'report_pending'
        WHEN 3 THEN 'report_pending'
        WHEN 4 THEN 'clear'
        WHEN 5 THEN 'consider'
        WHEN 6 THEN 'report_suspended'
        WHEN 7 THEN 'canceled'
        WHEN 8 THEN 'canceled'
        WHEN 9 THEN 'clear'
        WHEN 10 THEN 'canceled'
        ELSE 'pending'
      END
      WHERE normalized_status IS NULL
    SQL

    execute <<~SQL.squish
      UPDATE background_checks
      SET provider_status = COALESCE(result, normalized_status)
      WHERE provider_status IS NULL
    SQL

    change_column_default :background_checks, :normalized_status, from: nil, to: "not_started"
  end

  def down
    remove_index :background_checks, :node_custom_id if index_exists?(:background_checks, :node_custom_id)
    remove_index :background_checks, :last_webhook_event_id if index_exists?(:background_checks, :last_webhook_event_id)
    remove_index :background_checks, :normalized_status if index_exists?(:background_checks, :normalized_status)

    remove_reference :background_checks, :company_profile, foreign_key: true
    remove_reference :background_checks, :job_application, foreign_key: true
    remove_reference :background_checks, :job, foreign_key: true

    remove_column :background_checks, :last_webhook_event_id
    remove_column :background_checks, :dashboard_url
    remove_column :background_checks, :report_url
    remove_column :background_checks, :report_eta_at
    remove_column :background_checks, :work_location_city
    remove_column :background_checks, :work_location_state
    remove_column :background_checks, :work_location_country
    remove_column :background_checks, :node_custom_id
    remove_column :background_checks, :invitation_url
    remove_column :background_checks, :provider_assess_status
    remove_column :background_checks, :provider_status
    remove_column :background_checks, :normalized_status
  end
end
