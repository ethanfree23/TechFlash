# frozen_string_literal: true

# Durable administrative visibility for post-success ACH/financial problems.
# Does not automatically reverse transfers or claw back technician funds.
class PaymentRiskEvent < ApplicationRecord
  belongs_to :job
  belongs_to :job_payment_transaction, optional: true

  RISK_KINDS = %w[
    pre_success_failure
    post_success_return
    post_success_dispute
    post_success_reversal_unconfirmed
    transfer_executed
    bank_payout_pending
    bank_payout_paid
    payout_unknown
    collection_outcome_unknown
    resolved
  ].freeze

  INVESTIGATION_STATUSES = %w[open reviewing resolved].freeze

  # Dispute / return lifecycle — distinct from investigation_status.
  LIFECYCLE_STATES = %w[
    opened
    under_review
    dispute_won
    dispute_lost
    funds_withdrawn
    funds_reinstated
    outcome_unknown
    confirmed_return
    unconfirmed_signal
    admin_resolved
  ].freeze

  validates :risk_kind, inclusion: { in: RISK_KINDS }
  validates :investigation_status, inclusion: { in: INVESTIGATION_STATUSES }
  validates :lifecycle_state, inclusion: { in: LIFECYCLE_STATES }, allow_nil: true
  validates :detected_at, presence: true
  validates :correlation_key, uniqueness: { allow_nil: true }

  scope :open_cases, -> { where(investigation_status: %w[open reviewing]) }
  scope :blocking, -> {
    open_cases.where(risk_kind: %w[
      post_success_return
      post_success_dispute
      post_success_reversal_unconfirmed
    ])
  }

  def self.open_for_job?(job)
    blocking.where(job_id: job.id).exists?
  end

  def self.record!(
    job:,
    risk_kind:,
    amount_cents: nil,
    job_payment_transaction: nil,
    stripe_event_id: nil,
    stripe_payment_intent_id: nil,
    stripe_charge_id: nil,
    stripe_refund_id: nil,
    stripe_dispute_id: nil,
    stripe_transfer_id: nil,
    stripe_connected_account_id: nil,
    stripe_payout_id: nil,
    bank_payout_status: "unknown",
    admin_note: nil,
    metadata: {},
    correlation_key: nil,
    lifecycle_state: nil,
    confirmed_loss_cents: nil,
    exposure_confirmed: false,
    transfer_already_executed: false
  )
    create!(
      job: job,
      job_payment_transaction: job_payment_transaction,
      risk_kind: risk_kind,
      investigation_status: risk_kind.to_s == "resolved" ? "resolved" : "open",
      amount_cents: amount_cents,
      currency: "usd",
      stripe_event_id: stripe_event_id,
      stripe_payment_intent_id: stripe_payment_intent_id,
      stripe_charge_id: stripe_charge_id,
      stripe_refund_id: stripe_refund_id,
      stripe_dispute_id: stripe_dispute_id,
      stripe_transfer_id: stripe_transfer_id,
      stripe_connected_account_id: stripe_connected_account_id,
      stripe_payout_id: stripe_payout_id,
      bank_payout_status: bank_payout_status.presence || "unknown",
      investigation_required: risk_kind.to_s != "resolved",
      admin_note: admin_note,
      metadata_json: metadata,
      correlation_key: correlation_key,
      lifecycle_state: lifecycle_state,
      confirmed_loss_cents: confirmed_loss_cents,
      exposure_confirmed: exposure_confirmed,
      transfer_already_executed: transfer_already_executed,
      detected_at: Time.current,
      resolved_at: (Time.current if risk_kind.to_s == "resolved")
    )
  end

  # Higher rank = more authoritative. Delayed lower-rank events must not regress state.
  LIFECYCLE_RANK = {
    "outcome_unknown" => 0,
    "opened" => 1,
    "under_review" => 2,
    "confirmed_return" => 2,
    "funds_withdrawn" => 3,
    "dispute_won" => 4,
    "dispute_lost" => 4,
    "funds_reinstated" => 5,
    "unconfirmed_signal" => 1,
    "admin_resolved" => 100
  }.freeze

  # Idempotent dispute upsert keyed by Stripe dispute ID.
  # Closed ≠ funds reinstated; never auto-unblocks transfers.
  ADVERSE_EVENT_TYPES = %w[
    charge.dispute.funds_withdrawn
  ].freeze

  def self.upsert_dispute!(
    job:,
    dispute:,
    job_payment_transaction:,
    event_type:,
    stripe_event_id: nil,
    stripe_event_created_at: nil,
    ach_confirmed_return: false
  )
    dispute_id = dispute.id.to_s
    raise ArgumentError, "dispute id required" if dispute_id.blank?

    key = "dispute:#{dispute_id}"
    attempts = 0
    event_created = normalize_event_time(stripe_event_created_at)

    begin
      attempts += 1
      apply_dispute_upsert!(
        key: key,
        job: job,
        dispute: dispute,
        job_payment_transaction: job_payment_transaction,
        event_type: event_type,
        stripe_event_id: stripe_event_id,
        stripe_event_created_at: event_created,
        ach_confirmed_return: ach_confirmed_return
      )
    rescue ActiveRecord::RecordNotUnique
      raise if attempts >= 3

      retry
    rescue ActiveRecord::RecordInvalid => e
      raise unless e.record&.errors&.of_kind?(:correlation_key, :taken)
      raise if attempts >= 3

      retry
    end
  end

  def self.normalize_event_time(value)
    case value
    when Time, ActiveSupport::TimeWithZone then value
    when Integer then Time.zone.at(value)
    when String then (Time.zone.parse(value) rescue Time.current)
    else Time.current
    end
  end

  def self.adverse_financial_event?(event_type, dispute, ach_confirmed_return: false)
    return true if ADVERSE_EVENT_TYPES.include?(event_type.to_s)
    return true if event_type.to_s == "charge.dispute.closed" && dispute.status.to_s == "lost"
    return true if ach_confirmed_return && event_type.to_s.in?(%w[charge.dispute.created charge.dispute.closed charge.dispute.funds_withdrawn])

    false
  end

  def self.apply_dispute_upsert!(
    key:,
    job:,
    dispute:,
    job_payment_transaction:,
    event_type:,
    stripe_event_id:,
    stripe_event_created_at:,
    ach_confirmed_return:
  )
    transfer_done = job.job_payment_transactions
      .where(transaction_type: :technician_transfer, status: :succeeded)
      .exists?

    base_lifecycle = lifecycle_for_dispute_event(event_type, dispute)
    lifecycle = if ach_confirmed_return && base_lifecycle.in?(%w[opened under_review])
      "confirmed_return"
    else
      base_lifecycle
    end

    risk_kind = ach_confirmed_return ? "post_success_return" : "post_success_dispute"
    event_created = stripe_event_created_at || Time.current

    transaction do
      rec = lock.find_or_initialize_by(correlation_key: key)
      was_new = rec.new_record?

      # Event-id dedupe: identical Stripe event already applied.
      if stripe_event_id.present? && Array(rec.metadata_json.to_h["processed_event_ids"]).include?(stripe_event_id.to_s)
        return [rec, false]
      end

      history = Array(rec.metadata_json.to_h["event_history"])
      history << {
        "event_type" => event_type.to_s,
        "stripe_status" => dispute.status.to_s,
        "lifecycle" => lifecycle,
        "at" => Time.current.iso8601,
        "stripe_event_id" => stripe_event_id,
        "stripe_event_created_at" => event_created.iso8601
      }
      processed_ids = Array(rec.metadata_json.to_h["processed_event_ids"])
      processed_ids << stripe_event_id.to_s if stripe_event_id.present?

      admin_resolved = rec.persisted? && rec.investigation_status == "resolved" && rec.lifecycle_state == "admin_resolved"
      if admin_resolved
        newer_adverse = adverse_financial_event?(event_type, dispute, ach_confirmed_return: ach_confirmed_return) &&
          (rec.resolved_at.blank? || event_created > rec.resolved_at)

        unless newer_adverse
          # Older / replayed event after admin resolution — history only.
          rec.update!(
            metadata_json: rec.metadata_json.to_h.merge(
              "event_history" => history.last(25),
              "processed_event_ids" => processed_ids.last(50),
              "post_resolve_event" => {
                "event_type" => event_type.to_s,
                "stripe_status" => dispute.status.to_s,
                "stripe_event_created_at" => event_created.iso8601,
                "at" => Time.current.iso8601,
                "action" => "history_only"
              }
            )
          )
          return [rec, false]
        end

        # Genuinely newer verified financial loss — reopen blocking risk.
        risk_kind = ach_confirmed_return || lifecycle == "confirmed_return" ? "post_success_return" : "post_success_dispute"
        rec.assign_attributes(
          risk_kind: risk_kind,
          investigation_status: "open",
          investigation_required: true,
          lifecycle_state: lifecycle,
          exposure_confirmed: true,
          confirmed_loss_cents: dispute.amount || job_payment_transaction&.amount_cents || rec.confirmed_loss_cents,
          resolved_at: nil,
          reopened_at: Time.current,
          reopened_by_event_id: stripe_event_id,
          last_stripe_event_created_at: event_created,
          stripe_event_id: stripe_event_id.presence || rec.stripe_event_id,
          admin_note: [
            rec.admin_note,
            "REOPENED after admin resolve by Stripe event #{stripe_event_id} (#{event_type}, status=#{dispute.status}). Previously resolved_by=#{rec.resolved_by}."
          ].compact.join("\n"),
          metadata_json: rec.metadata_json.to_h.merge(
            "event_history" => history.last(25),
            "processed_event_ids" => processed_ids.last(50),
            "reopened" => true,
            "prior_resolved_by" => rec.resolved_by,
            "confirmed" => true
          )
        )
        rec.save!
        return [rec, false]
      end

      if rec.persisted? && rec.risk_kind == "post_success_return"
        risk_kind = "post_success_return"
      end

      # Chronology by Stripe event created timestamp (not LIFECYCLE_RANK alone).
      last_created = rec.last_stripe_event_created_at
      older_replay = last_created.present? && event_created < last_created
      if older_replay
        # Append history but do not regress authoritative newer state.
        rec.update!(
          metadata_json: rec.metadata_json.to_h.merge(
            "event_history" => history.last(25),
            "processed_event_ids" => processed_ids.last(50)
          )
        )
        return [rec, false]
      end

      # Same-timestamp / concurrent delivery: prefer more adverse Stripe object evidence.
      if last_created.present? && event_created == last_created
        incoming_rank = LIFECYCLE_RANK.fetch(lifecycle, 0)
        current_rank = LIFECYCLE_RANK.fetch(rec.lifecycle_state.to_s, -1)
        if incoming_rank < current_rank && !adverse_financial_event?(event_type, dispute, ach_confirmed_return: ach_confirmed_return)
          rec.update!(
            metadata_json: rec.metadata_json.to_h.merge(
              "event_history" => history.last(25),
              "processed_event_ids" => processed_ids.last(50)
            )
          )
          return [rec, false]
        end
      end

      effective_lifecycle = lifecycle
      loss_amount = dispute.amount || job_payment_transaction&.amount_cents
      exposure = ach_confirmed_return || rec.exposure_confirmed ||
        effective_lifecycle.in?(%w[funds_withdrawn confirmed_return dispute_lost])
      confirmed_loss = if effective_lifecycle == "funds_reinstated"
        rec.confirmed_loss_cents
      elsif ach_confirmed_return || effective_lifecycle.in?(%w[funds_withdrawn dispute_lost confirmed_return])
        loss_amount
      else
        rec.confirmed_loss_cents
      end

      attrs = {
        job: job,
        job_payment_transaction: job_payment_transaction,
        risk_kind: risk_kind,
        amount_cents: loss_amount,
        currency: "usd",
        stripe_event_id: stripe_event_id.presence || rec.stripe_event_id,
        stripe_payment_intent_id: dispute.payment_intent.to_s.presence || job_payment_transaction&.stripe_payment_intent_id,
        stripe_charge_id: dispute.charge.to_s.presence || job_payment_transaction&.stripe_charge_id,
        stripe_dispute_id: dispute.id.to_s,
        bank_payout_status: "unknown",
        investigation_required: true,
        investigation_status: effective_lifecycle.in?(%w[dispute_won dispute_lost funds_reinstated]) ? "reviewing" : "open",
        lifecycle_state: effective_lifecycle,
        exposure_confirmed: exposure,
        confirmed_loss_cents: confirmed_loss,
        transfer_already_executed: transfer_done || rec.transfer_already_executed,
        last_stripe_event_created_at: event_created,
        admin_note: [
          rec.admin_note,
          "Dispute #{dispute.id} #{event_type} status=#{dispute.status}. No automatic transfer reversal."
        ].compact.join("\n"),
        metadata_json: rec.metadata_json.to_h.merge(
          "reason" => dispute.reason.to_s,
          "stripe_status" => dispute.status.to_s,
          "event_type" => event_type.to_s,
          "ach_confirmed_return" => ach_confirmed_return || rec.metadata_json.to_h["ach_confirmed_return"],
          "confirmed" => exposure,
          "funds_reinstated" => (effective_lifecycle == "funds_reinstated"),
          "event_history" => history.last(25),
          "processed_event_ids" => processed_ids.last(50)
        ),
        detected_at: rec.detected_at || Time.current
      }

      if effective_lifecycle == "funds_reinstated"
        attrs[:admin_note] = [
          attrs[:admin_note],
          "Funds reinstated — exposure history retained; awaiting admin confirmation to clear transfer block."
        ].join("\n")
      end

      rec.assign_attributes(attrs)
      rec.save!
      [rec, was_new]
    end
  end

  # Confirmed ACH return path (authoritative dispute evidence on a US bank debit).
  def self.record_confirmed_ach_return!(
    job:,
    job_payment_transaction:,
    dispute: nil,
    stripe_payment_intent_id: nil,
    stripe_charge_id: nil,
    amount_cents: nil,
    stripe_event_id: nil,
    stripe_dispute_id: nil,
    admin_note: nil,
    metadata: {}
  )
    charge_id = stripe_charge_id.presence || dispute&.charge.to_s.presence || job_payment_transaction&.stripe_charge_id
    dispute_id = stripe_dispute_id.presence || dispute&.id.to_s.presence
    key = if dispute_id.present?
      "dispute:#{dispute_id}"
    elsif charge_id.present?
      "ach_return:#{charge_id}"
    else
      "ach_return:pi:#{stripe_payment_intent_id || job_payment_transaction&.stripe_payment_intent_id}"
    end

    transfer_done = job.job_payment_transactions
      .where(transaction_type: :technician_transfer, status: :succeeded)
      .exists?

    transaction do
      rec = lock.find_or_initialize_by(correlation_key: key)
      history = Array(rec.metadata_json.to_h["event_history"])
      history << { "kind" => "confirmed_ach_return", "at" => Time.current.iso8601, "stripe_event_id" => stripe_event_id }

      loss = amount_cents || dispute&.amount || job_payment_transaction&.amount_cents
      rec.assign_attributes(
        job: job,
        job_payment_transaction: job_payment_transaction,
        risk_kind: "post_success_return",
        investigation_status: rec.investigation_status == "resolved" ? "resolved" : "open",
        investigation_required: true,
        amount_cents: loss,
        currency: "usd",
        confirmed_loss_cents: loss,
        exposure_confirmed: true,
        lifecycle_state: "confirmed_return",
        stripe_event_id: stripe_event_id.presence || rec.stripe_event_id,
        stripe_payment_intent_id: stripe_payment_intent_id.presence || dispute&.payment_intent.to_s.presence || job_payment_transaction&.stripe_payment_intent_id,
        stripe_charge_id: charge_id,
        stripe_dispute_id: dispute_id,
        bank_payout_status: "unknown",
        transfer_already_executed: transfer_done || rec.transfer_already_executed,
        admin_note: [rec.admin_note, admin_note.presence || "Confirmed ACH return. Historical collection success preserved. No automatic reversal."].compact.join("\n"),
        metadata_json: rec.metadata_json.to_h.merge(metadata).merge(
          "confirmed" => true,
          "event_history" => history.last(25)
        ),
        detected_at: rec.detected_at || Time.current
      )
      rec.save!
      rec
    end
  end

  # Unconfirmed post-success failure signal — never marks confirmed loss.
  def self.record_unconfirmed_post_success_signal!(
    job:,
    job_payment_transaction:,
    stripe_payment_intent_id:,
    stripe_charge_id: nil,
    amount_cents: nil,
    stripe_event_id: nil,
    admin_note: nil,
    metadata: {}
  )
    key = "unconfirmed_pi:#{stripe_payment_intent_id}"
    transfer_done = job.job_payment_transactions
      .where(transaction_type: :technician_transfer, status: :succeeded)
      .exists?

    transaction do
      rec = lock.find_or_initialize_by(correlation_key: key)
      history = Array(rec.metadata_json.to_h["event_history"])
      history << { "kind" => "unconfirmed_signal", "at" => Time.current.iso8601, "stripe_event_id" => stripe_event_id }

      # If already escalated to confirmed return, do not downgrade.
      if rec.persisted? && rec.exposure_confirmed
        rec.update!(
          metadata_json: rec.metadata_json.to_h.merge("event_history" => history.last(25), "late_unconfirmed_signal" => metadata)
        )
        return rec
      end

      rec.assign_attributes(
        job: job,
        job_payment_transaction: job_payment_transaction,
        risk_kind: "post_success_reversal_unconfirmed",
        investigation_status: rec.investigation_status == "resolved" ? "resolved" : "open",
        investigation_required: true,
        amount_cents: amount_cents || job_payment_transaction&.amount_cents,
        currency: "usd",
        confirmed_loss_cents: nil,
        exposure_confirmed: false,
        lifecycle_state: "unconfirmed_signal",
        stripe_event_id: stripe_event_id.presence || rec.stripe_event_id,
        stripe_payment_intent_id: stripe_payment_intent_id,
        stripe_charge_id: stripe_charge_id,
        bank_payout_status: "unknown",
        transfer_already_executed: transfer_done || rec.transfer_already_executed,
        admin_note: [rec.admin_note, admin_note].compact.join("\n"),
        metadata_json: rec.metadata_json.to_h.merge(metadata).merge(
          "confirmed" => false,
          "event_history" => history.last(25)
        ),
        detected_at: rec.detected_at || Time.current
      )
      rec.save!
      rec
    end
  end

  def self.lifecycle_for_dispute_event(event_type, dispute)
    case event_type.to_s
    when "charge.dispute.created"
      "opened"
    when "charge.dispute.updated"
      "under_review"
    when "charge.dispute.funds_withdrawn"
      "funds_withdrawn"
    when "charge.dispute.funds_reinstated"
      "funds_reinstated"
    when "charge.dispute.closed"
      case dispute.status.to_s
      when "won", "warning_closed" then "dispute_won"
      when "lost" then "dispute_lost"
      else "outcome_unknown"
      end
    else
      "outcome_unknown"
    end
  end

  def resolve!(note: nil, actor: nil)
    prior = risk_kind
    update!(
      investigation_status: "resolved",
      investigation_required: false,
      risk_kind: "resolved",
      lifecycle_state: "admin_resolved",
      resolved_by: actor.to_s.presence || resolved_by,
      admin_note: [
        admin_note,
        note,
        ("resolved_by=#{actor}" if actor.present?)
      ].compact.join("\n").presence,
      resolved_at: Time.current,
      metadata_json: metadata_json.to_h.merge(
        "admin_resolved_at" => Time.current.iso8601,
        "prior_risk_kind" => prior,
        "resolved_by" => actor
      )
    )
  end
end
