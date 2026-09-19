# frozen_string_literal: true

# Extends the existing counter-offer negotiation so one offer can carry compensation
# changes (as today), schedule changes, or both. Every column is nullable or defaulted so
# counter offers written before this migration keep behaving as plain compensation offers.
class AddScheduleProposalToJobCounterOffers < ActiveRecord::Migration[7.1]
  def change
    add_column :job_counter_offers, :proposal_kind, :integer, default: 0, null: false
    add_column :job_counter_offers, :proposal_reason, :integer, default: 0, null: false
    add_column :job_counter_offers, :schedule_option, :integer

    # Snapshot of what was being negotiated against, so the company sees the same
    # before/after the job is later edited.
    add_column :job_counter_offers, :original_start_at, :datetime
    add_column :job_counter_offers, :original_end_at, :datetime
    add_column :job_counter_offers, :original_days, :integer

    add_column :job_counter_offers, :proposed_working_dates, :json, default: [], null: false
    add_column :job_counter_offers, :unavailable_working_dates, :json, default: [], null: false
    add_column :job_counter_offers, :conflicting_job_ids, :json, default: [], null: false
    add_column :job_counter_offers, :committed_through_at, :datetime

    add_column :job_counter_offers, :full_duration_offered, :boolean, default: false, null: false
    add_column :job_counter_offers, :partial_duration, :boolean, default: false, null: false

    # Digest of the job's schedule/pay terms when the proposal was made. A mismatch means
    # the proposal is stale and must be recalculated rather than accepted on old data.
    add_column :job_counter_offers, :schedule_signature, :string
    add_column :job_counter_offers, :invalidated_at, :datetime
    add_column :job_counter_offers, :invalidated_reason, :string

    add_index :job_counter_offers, :proposal_kind
    add_index :job_counter_offers, [:job_id, :status]
  end
end
