# frozen_string_literal: true

class AddTransferRetryAuthorizations < ActiveRecord::Migration[7.0]
  def change
    create_table :transfer_retry_authorizations do |t|
      t.integer :job_payment_transaction_id, null: false
      t.integer :granted_by_user_id
      t.string :granted_by_email
      t.text :reason, null: false
      t.boolean :acknowledged_prior_timeout_risk, null: false, default: false
      t.datetime :granted_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :consumed_at
      t.integer :consumed_by_user_id
      t.string :status, null: false, default: "granted"
      t.string :lookup_outcome_at_grant
      t.string :token, null: false
      t.json :metadata_json, default: {}, null: false
      t.timestamps
    end
    add_index :transfer_retry_authorizations, :job_payment_transaction_id, name: "idx_xfer_retry_auth_on_txn"
    add_index :transfer_retry_authorizations, :token, unique: true, name: "idx_xfer_retry_auth_on_token"
    add_index :transfer_retry_authorizations, %i[job_payment_transaction_id status], name: "idx_xfer_retry_auth_on_txn_status"

    create_table :transfer_retry_authorization_audits do |t|
      t.integer :job_payment_transaction_id, null: false
      t.integer :transfer_retry_authorization_id
      t.integer :actor_user_id
      t.string :actor_email
      t.string :event, null: false
      t.text :reason
      t.boolean :acknowledged_prior_timeout_risk
      t.string :lookup_outcome
      t.string :decision
      t.string :final_outcome
      t.json :metadata_json, default: {}, null: false
      t.datetime :created_at, null: false
    end
    add_index :transfer_retry_authorization_audits, :job_payment_transaction_id, name: "idx_xfer_retry_audit_on_txn"
    add_index :transfer_retry_authorization_audits, :transfer_retry_authorization_id, name: "idx_xfer_retry_audit_on_auth"
    add_index :transfer_retry_authorization_audits, :created_at, name: "idx_xfer_retry_audit_on_created"
  end
end
