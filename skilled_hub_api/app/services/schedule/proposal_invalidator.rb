# frozen_string_literal: true

module Schedule
  # Invalidates pending alternate-schedule proposals whose underlying job terms changed.
  #
  # Only touches schedule-bearing proposals: plain compensation counter offers (everything
  # written before schedule proposals existed) carry a nil signature and are left alone.
  class ProposalInvalidator
    PENDING_STATUSES = %i[pending_company pending_technician].freeze

    def self.invalidate_stale_for_job!(job, reason: "job_terms_changed")
      return 0 if job.blank?

      signature = ProposalSignature.for(job)
      stale = job.job_counter_offers
                 .where(status: PENDING_STATUSES)
                 .where.not(schedule_signature: nil)
                 .where.not(schedule_signature: signature)

      ids = stale.pluck(:id)
      return 0 if ids.empty?

      JobCounterOffer.where(id: ids).update_all(
        status: JobCounterOffer.statuses[:invalidated],
        invalidated_at: Time.current,
        invalidated_reason: reason,
        responded_at: Time.current,
        updated_at: Time.current
      )
      ids.length
    end

    # Reason a specific proposal can no longer be accepted as-is, or nil when it is current.
    def self.stale_reason(offer)
      return nil if offer.blank?
      return "invalidated" if offer.respond_to?(:invalidated?) && offer.invalidated?
      return nil if offer.schedule_signature.blank?

      current = ProposalSignature.for(offer.job)
      return nil if current == offer.schedule_signature

      "job_terms_changed"
    end
  end
end
