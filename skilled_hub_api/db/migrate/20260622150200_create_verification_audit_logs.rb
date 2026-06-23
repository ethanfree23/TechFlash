class CreateVerificationAuditLogs < ActiveRecord::Migration[7.1]
  def change
    create_table :verification_audit_logs do |t|
      t.references :user, null: false, foreign_key: true
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.string :entity_type, null: false
      t.bigint :entity_id, null: false
      t.string :action, null: false
      t.json :details, default: {}

      t.timestamps
    end

    add_index :verification_audit_logs, [:entity_type, :entity_id]
    add_index :verification_audit_logs, :action
    add_index :verification_audit_logs, :created_at
  end
end
