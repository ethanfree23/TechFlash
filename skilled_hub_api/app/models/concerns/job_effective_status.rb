# frozen_string_literal: true

# Single source of truth for a job's current business lifecycle status.
# Persisted `status` remains the workflow enum; expiration is derived from
# scheduled_end_at while the row stays `open`.
module JobEffectiveStatus
  extend ActiveSupport::Concern

  CLAIMED_STATUSES = %i[reserved filled accepted].freeze
  COMPLETED_STATUSES = %i[finished completed].freeze
  PENDING_COUNTER_OFFER_STATUSES = %i[pending_company pending_technician].freeze

  included do
    scope :effectively_open, lambda {
      where(status: :open).where("scheduled_end_at IS NULL OR scheduled_end_at >= ?", Time.current)
    }
    scope :expired_listings, lambda {
      where(status: :open).where("scheduled_end_at IS NOT NULL AND scheduled_end_at < ?", Time.current)
    }
    scope :effectively_claimed, lambda {
      where(status: JobEffectiveStatus::CLAIMED_STATUSES)
        .where("scheduled_start_at IS NULL OR scheduled_start_at > ?", Time.current)
    }
    scope :effectively_active, lambda {
      where(status: JobEffectiveStatus::CLAIMED_STATUSES)
        .where("scheduled_start_at IS NOT NULL AND scheduled_start_at <= ?", Time.current)
    }
    scope :in_progress, -> { where(status: %i[reserved filled]) }
    scope :effectively_completed, -> { where(status: JobEffectiveStatus::COMPLETED_STATUSES) }
    scope :with_pending_counter_offer, lambda {
      where(
        id: JobCounterOffer.where(status: JobEffectiveStatus::PENDING_COUNTER_OFFER_STATUSES).select(:job_id)
      )
    }
  end

  def listing_expired?
    open? && scheduled_end_at.present? && scheduled_end_at < Time.current
  end

  def effectively_open?
    open? && !listing_expired?
  end

  def available_for_claim?
    effectively_open?
  end

  def effective_status
    return "pending_funding" if pending_funding?
    return "completed" if finished? || completed?
    if reserved? || filled? || accepted?
      return "active" if scheduled_start_at.present? && scheduled_start_at <= Time.current

      return "claimed"
    end
    return "expired" if listing_expired?
    return "open" if open?

    status.to_s
  end
end
