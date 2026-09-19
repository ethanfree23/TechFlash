class JobCounterOfferSerializer < ActiveModel::Serializer
  attributes :id, :job_id, :technician_profile_id, :company_profile_id, :parent_offer_id,
             :status, :created_by_role, :proposed_hourly_rate_cents, :proposed_hours_per_day,
             :proposed_days, :proposed_start_at, :proposed_end_at, :proposed_start_mode,
             :proposal_kind, :proposal_reason, :responded_at, :created_at, :updated_at

  attribute :schedule_proposal, if: :schedule_proposal?

  def schedule_proposal?
    object.schedule_proposal?
  end

  # Structured schedule data, not free text: the company gets the original window, what
  # the technician is committed to, and exactly which requested days are on offer.
  def schedule_proposal
    stale_reason = object.stale_reason
    {
      option: object.schedule_option,
      reason: object.proposal_reason,
      original_start_at: object.original_start_at,
      original_end_at: object.original_end_at,
      original_days: object.original_days,
      proposed_start_at: object.proposed_start_at,
      proposed_end_at: object.proposed_end_at,
      proposed_days: object.proposed_days,
      proposed_working_dates: object.proposed_working_dates_list,
      unavailable_working_dates: object.unavailable_working_dates_list,
      conflicting_job_ids: object.conflicting_job_ids_list,
      committed_through_at: object.committed_through_at,
      full_duration_offered: object.full_duration_offered,
      partial_duration: object.partial_duration,
      stale: stale_reason.present?,
      stale_reason: stale_reason,
      invalidated_at: object.invalidated_at,
      invalidated_reason: object.invalidated_reason
    }
  end
end
