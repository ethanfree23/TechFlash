# frozen_string_literal: true

class AddJobFinancialLedger < ActiveRecord::Migration[7.1]
  def up
    add_column :jobs, :pay_basis, :integer, default: 0, null: false
    add_column :jobs, :agreed_hourly_rate_cents, :integer
    add_column :jobs, :estimated_hours, :decimal, precision: 10, scale: 2
    add_column :jobs, :agreed_labor_cents, :integer
    add_column :jobs, :company_commission_percent_snapshot, :decimal, precision: 6, scale: 3
    add_column :jobs, :technician_commission_percent_snapshot, :decimal, precision: 6, scale: 3
    add_column :jobs, :company_membership_tier_config_id, :integer
    add_column :jobs, :technician_membership_tier_config_id, :integer
    add_column :jobs, :funding_status, :integer, default: 0, null: false
    add_column :jobs, :settlement_status, :integer, default: 0, null: false
    add_column :jobs, :financial_revision, :integer, default: 1, null: false

    add_index :jobs, :pay_basis
    add_index :jobs, :funding_status
    add_index :jobs, :company_membership_tier_config_id
    add_index :jobs, :technician_membership_tier_config_id

    add_column :payments, :currency, :string, default: "usd", null: false
    add_column :payments, :transfer_group, :string

    create_table :job_payment_transactions do |t|
      t.references :payment, null: false, foreign_key: true
      t.references :job, null: false, foreign_key: true
      t.integer :transaction_type, null: false
      t.integer :direction, null: false
      t.integer :amount_cents, null: false
      t.string :currency, default: "usd", null: false
      t.integer :status, default: 0, null: false
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.string :stripe_refund_id
      t.string :stripe_transfer_id
      t.string :idempotency_key, null: false
      t.integer :revision, default: 1, null: false
      t.json :metadata_json, default: {}
      t.text :error_message
      t.datetime :succeeded_at
      t.timestamps
    end
    add_index :job_payment_transactions, :idempotency_key, unique: true
    add_index :job_payment_transactions, :stripe_payment_intent_id
    add_index :job_payment_transactions, :stripe_refund_id
    add_index :job_payment_transactions, :stripe_transfer_id
    add_index :job_payment_transactions, [:job_id, :transaction_type]

    create_table :job_financial_revisions do |t|
      t.references :job, null: false, foreign_key: true
      t.integer :revision_number, null: false
      t.string :source, null: false
      t.integer :hourly_rate_cents
      t.decimal :estimated_hours, precision: 10, scale: 2
      t.integer :labor_cents, null: false, default: 0
      t.integer :company_required_cents, null: false, default: 0
      t.integer :technician_payout_cents, null: false, default: 0
      t.decimal :company_commission_percent, precision: 6, scale: 3
      t.decimal :technician_commission_percent, precision: 6, scale: 3
      t.integer :job_payment_transaction_id
      t.json :metadata_json, default: {}
      t.timestamps
    end
    add_index :job_financial_revisions, [:job_id, :revision_number], unique: true

    add_column :technician_profiles, :stripe_charges_enabled, :boolean, default: false, null: false
    add_column :technician_profiles, :stripe_payouts_enabled, :boolean, default: false, null: false
    add_column :technician_profiles, :stripe_details_submitted, :boolean, default: false, null: false
    add_column :technician_profiles, :stripe_transfers_capability_status, :string
    add_column :technician_profiles, :stripe_connect_requirements_due, :json, default: {}
    add_column :technician_profiles, :stripe_connect_synced_at, :datetime
    add_column :technician_profiles, :pending_membership_level, :string

    add_column :company_profiles, :pending_membership_level, :string

    backfill_existing_jobs_and_payments
  end

  def down
    remove_column :company_profiles, :pending_membership_level
    remove_column :technician_profiles, :pending_membership_level
    remove_column :technician_profiles, :stripe_connect_synced_at
    remove_column :technician_profiles, :stripe_connect_requirements_due
    remove_column :technician_profiles, :stripe_transfers_capability_status
    remove_column :technician_profiles, :stripe_details_submitted
    remove_column :technician_profiles, :stripe_payouts_enabled
    remove_column :technician_profiles, :stripe_charges_enabled

    drop_table :job_financial_revisions
    drop_table :job_payment_transactions

    remove_column :payments, :transfer_group
    remove_column :payments, :currency

    remove_index :jobs, :technician_membership_tier_config_id if index_exists?(:jobs, :technician_membership_tier_config_id)
    remove_index :jobs, :company_membership_tier_config_id if index_exists?(:jobs, :company_membership_tier_config_id)
    remove_index :jobs, :funding_status if index_exists?(:jobs, :funding_status)
    remove_index :jobs, :pay_basis if index_exists?(:jobs, :pay_basis)

    remove_column :jobs, :financial_revision
    remove_column :jobs, :settlement_status
    remove_column :jobs, :funding_status
    remove_column :jobs, :technician_membership_tier_config_id
    remove_column :jobs, :company_membership_tier_config_id
    remove_column :jobs, :technician_commission_percent_snapshot
    remove_column :jobs, :company_commission_percent_snapshot
    remove_column :jobs, :agreed_labor_cents
    remove_column :jobs, :estimated_hours
    remove_column :jobs, :agreed_hourly_rate_cents
    remove_column :jobs, :pay_basis
  end

  private

  def backfill_existing_jobs_and_payments
    say_with_time "Backfill job snapshots and ledger transactions" do
      Job.reset_column_information
      Payment.reset_column_information

      Job.find_each do |job|
        labor = job.job_amount_cents.to_i
        hours = if job.hours_per_day.present? && job.days.present?
          job.hours_per_day.to_d * job.days.to_d
        end
        company_pct = MembershipPolicy.company_commission_percent(job.company_profile)
        company_tier = MembershipTierConfig.find_by(audience: "company", slug: job.company_profile&.membership_level)

        accepted = job.job_applications.find_by(status: :accepted)
        tech_profile = accepted&.technician_profile
        tech_pct = MembershipPolicy.technician_commission_percent(tech_profile)
        tech_tier = if tech_profile
          MembershipTierConfig.find_by(audience: "technician", slug: tech_profile.membership_level)
        end

        payment = job.payments.order(:id).first
        funding = if payment&.status.in?(%w[held released])
          1 # funded
        elsif labor <= 0 || MembershipPolicy.billing_exempt?(job.company_profile)
          1
        else
          0
        end
        settlement = payment&.status == "released" ? 2 : 0

        job.update_columns(
          pay_basis: 0,
          agreed_hourly_rate_cents: job.hourly_rate_cents,
          estimated_hours: hours,
          agreed_labor_cents: labor,
          company_commission_percent_snapshot: company_pct,
          technician_commission_percent_snapshot: tech_profile ? tech_pct : nil,
          company_membership_tier_config_id: company_tier&.id,
          technician_membership_tier_config_id: tech_tier&.id,
          funding_status: funding,
          settlement_status: settlement,
          financial_revision: 1,
          updated_at: Time.current
        )

        next unless payment

        payment.update_columns(
          currency: "usd",
          transfer_group: "TECHFLASH_JOB_#{job.id}",
          updated_at: Time.current
        )

        charge_amount = job.company_charge_cents.to_i
        charge_amount = payment.amount_cents if charge_amount <= 0
        if payment.status.in?(%w[held released refunded pending failed])
          JobPaymentTransaction.create!(
            payment: payment,
            job: job,
            transaction_type: :initial_job_charge,
            direction: :inbound,
            amount_cents: [charge_amount, 1].max,
            currency: "usd",
            status: charge_status_for(payment),
            stripe_payment_intent_id: payment.stripe_payment_intent_id,
            idempotency_key: "tf_job_#{job.id}_legacy_initial_#{payment.id}",
            revision: 1,
            succeeded_at: payment.held_at,
            metadata_json: { "legacy" => true }
          )
        end
        if payment.status == "released" && payment.stripe_transfer_id.present?
          JobPaymentTransaction.create!(
            payment: payment,
            job: job,
            transaction_type: :technician_transfer,
            direction: :outbound,
            amount_cents: payment.amount_cents,
            currency: "usd",
            status: :succeeded,
            stripe_transfer_id: payment.stripe_transfer_id,
            idempotency_key: "tf_job_#{job.id}_legacy_transfer_#{payment.id}",
            revision: 1,
            succeeded_at: payment.released_at,
            metadata_json: { "legacy" => true }
          )
        end
        if payment.status == "refunded"
          JobPaymentTransaction.create!(
            payment: payment,
            job: job,
            transaction_type: :refund,
            direction: :outbound,
            amount_cents: charge_amount,
            currency: "usd",
            status: :succeeded,
            idempotency_key: "tf_job_#{job.id}_legacy_refund_#{payment.id}",
            revision: 1,
            metadata_json: { "legacy" => true }
          )
        end
      end
    end
  end

  def charge_status_for(payment)
    case payment.status
    when "held", "released" then :succeeded
    when "failed" then :failed
    when "refunded" then :succeeded
    else :pending
    end
  end
end
