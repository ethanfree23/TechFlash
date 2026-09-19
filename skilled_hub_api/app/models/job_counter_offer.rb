class JobCounterOffer < ApplicationRecord
  enum status: {
    pending_company: 0,
    pending_technician: 1,
    accepted: 2,
    declined: 3,
    superseded: 4,
    # The job's schedule/pay terms changed after this proposal was made, so it can no
    # longer be accepted on the data it was calculated from.
    invalidated: 5
  }

  enum created_by_role: {
    technician: 0,
    company: 1
  }

  enum proposed_start_mode: {
    hard_start: 0,
    rolling_start: 1
  }

  # What this offer is negotiating. Existing rows default to `compensation`, which is
  # exactly how counter offers behaved before schedule proposals existed.
  enum proposal_kind: {
    compensation: 0,
    schedule: 1,
    compensation_and_schedule: 2
  }, _prefix: :proposal

  enum proposal_reason: {
    standard: 0,
    schedule_conflict: 1
  }, _prefix: :reason

  # Which alternate schedule the technician offered.
  #   start_after_conflict - later start, full requested duration
  #   keep_original_end    - company's end date kept, remaining days only
  enum schedule_option: {
    start_after_conflict: 0,
    keep_original_end: 1
  }, _prefix: :schedule_option

  PENDING_STATUSES = %w[pending_company pending_technician].freeze

  belongs_to :job
  belongs_to :technician_profile
  belongs_to :company_profile
  belongs_to :parent_offer, class_name: "JobCounterOffer", optional: true
  has_many :countered_offers, class_name: "JobCounterOffer", foreign_key: :parent_offer_id, dependent: :nullify

  validates :proposed_hourly_rate_cents, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :proposed_hours_per_day, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 24 }, allow_nil: true
  validates :proposed_days, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
  validate :start_fields_consistent
  validate :schedule_proposal_fields_present

  scope :latest_first, -> { order(created_at: :desc) }
  scope :pending, -> { where(status: PENDING_STATUSES) }
  scope :schedule_proposals, -> { where(proposal_kind: %i[schedule compensation_and_schedule]) }

  def pending?
    pending_company? || pending_technician?
  end

  def schedule_proposal?
    proposal_schedule? || proposal_compensation_and_schedule?
  end

  # Terms to apply on acceptance. A schedule-only proposal leaves pay untouched, so each
  # field falls back to the job's current value instead of nulling it.
  def effective_hourly_rate_cents
    proposed_hourly_rate_cents.presence || job&.hourly_rate_cents
  end

  def effective_hours_per_day
    proposed_hours_per_day.presence || job&.hours_per_day
  end

  def effective_days
    proposed_days.presence || job&.days
  end

  def effective_start_at
    proposed_start_at.presence || job&.scheduled_start_at
  end

  def effective_end_at
    proposed_end_at.presence || job&.scheduled_end_at
  end

  def proposed_working_dates_list
    Array(proposed_working_dates).map(&:to_s)
  end

  def unavailable_working_dates_list
    Array(unavailable_working_dates).map(&:to_s)
  end

  def conflicting_job_ids_list
    Array(conflicting_job_ids).map(&:to_i)
  end

  # Nil when the proposal is still calculated against the job's current terms.
  def stale_reason
    Schedule::ProposalInvalidator.stale_reason(self)
  end

  def stale?
    stale_reason.present?
  end

  private

  def start_fields_consistent
    return unless hard_start?
    return if proposed_start_at.present?

    errors.add(:proposed_start_at, "is required for hard start offers")
  end

  def schedule_proposal_fields_present
    return unless schedule_proposal?

    errors.add(:proposed_end_at, "is required for a schedule proposal") if proposed_end_at.blank?
    errors.add(:proposed_days, "is required for a schedule proposal") if proposed_days.blank?
    errors.add(:schedule_option, "is required for a schedule proposal") if schedule_option.blank?
  end
end
