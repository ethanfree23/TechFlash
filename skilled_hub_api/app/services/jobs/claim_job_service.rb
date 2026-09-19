module Jobs
  class ClaimJobService
    SCHEDULE_CONFLICT_MESSAGE = "You already have a job scheduled during part of this job."
    STALE_PROPOSAL_MESSAGE =
      "This job's schedule or pay changed after the alternate schedule was proposed. " \
      "Ask the technician for an updated proposal."

    def self.call(job:, technician_user:, offer: nil)
      new(job: job, technician_user: technician_user, offer: offer).call
    end

    def initialize(job:, technician_user:, offer: nil)
      @job = job
      @technician_user = technician_user
      @offer = offer
    end

    def call
      return { error: "Only technicians can claim jobs" } unless @technician_user.technician?
      return { error: "Job is no longer available" } unless @job.available_for_claim?

      technician_profile = @technician_user.technician_profile || create_default_technician_profile!

      if technician_profile && !MembershipPolicy.job_visible_to_technician?(job: @job, technician_profile: technician_profile)
        return { error: "This job is not available for your tier yet.", status: :forbidden }
      end

      verification_gate = VerificationEligibilityService.call(job: @job, technician_profile: technician_profile)
      unless verification_gate.eligible
        return {
          error: "This job has verification requirements you have not completed.",
          status: :forbidden,
          verification_required: true,
          verification_reasons: verification_gate.reasons
        }
      end

      # Never fund or claim against a proposal that was calculated on terms the company has
      # since changed, and never mutate job terms for a job that is already full.
      if @offer.present? && (stale = Schedule::ProposalInvalidator.stale_reason(@offer))
        Schedule::ProposalInvalidator.invalidate_stale_for_job!(@job, reason: stale)
        return { error: STALE_PROPOSAL_MESSAGE, status: :conflict, schedule_proposal_stale: true }
      end
      return { error: "Job has already been claimed" } unless @job.capacity_available?

      apply_offer_terms! if @offer.present?
      ensure_schedule_for_start_mode!
      if schedule_invalid?
        revert_offer_terms!
        return { error: schedule_error_message }
      end

      conflict = Schedule::ConflictDetector.call(technician_profile: technician_profile, job: @job)
      if conflict.conflict?
        revert_offer_terms!
        # Accepting a counter offer is not a new Claim: a leftover overlap is a hard
        # failure, not another round of alternate-schedule options.
        if @offer.present?
          return {
            error: "This schedule still overlaps another job this technician has claimed.",
            status: :unprocessable_entity
          }
        end
        return schedule_conflict_result(conflict: conflict, technician_profile: technician_profile)
      end

      if @offer.present?
        funding = JobFundingAdjustmentService.reconcile!(@job, source: "counteroffer", transaction_type_prefix: "counteroffer")
        if funding[:requires_action]
          revert_offer_terms!
          return {
            error: funding[:error] || "Additional payment is required before these terms can be accepted.",
            requires_action: true,
            client_secret: funding[:client_secret],
            payment_adjustment_required: true
          }
        end
        unless funding[:success]
          revert_offer_terms!
          return { error: funding[:error] || "Could not fund the accepted counteroffer." }
        end
      else
        unless @job.funding_funded? || !@job.priced? || @job.job_funding_waived?
          return { error: "This job is not funded yet and cannot be claimed." }
        end
      end

      claim = create_claim_atomically!(technician_profile)
      if claim[:error]
        # Do not leave a failed accept sitting on the proposed dates of a job someone
        # else may already hold.
        revert_offer_terms!
        return claim
      end

      JobFundingService.snapshot_technician!(@job, technician_profile)
      MailDelivery.safe_deliver do
        UserMailer.job_claimed_email(@job).deliver_now
        UserMailer.technician_claimed_job_email(@job).deliver_now
      end

      { job: @job }
    end

    private

    # Re-checks capacity while holding a row lock so two simultaneous claims (or a claim
    # racing a counter-offer acceptance) cannot both succeed.
    def create_claim_atomically!(technician_profile)
      result = {}
      Job.transaction do
        locked = Job.lock.find(@job.id)
        if locked.capacity_available?
          JobApplication.create!(
            job: locked,
            technician_profile: technician_profile,
            status: :accepted
          )
          locked.reload
          locked.update!(status: :filled) unless locked.capacity_available?
        else
          result = { error: "Job has already been claimed" }
        end
      end
      @job.reload
      Schedule::ConflictDetector.reset_commitments_cache!(technician_profile)
      result
    end

    def create_default_technician_profile!
      TechnicianProfile.create!(
        user: @technician_user,
        trade_type: "General",
        experience_years: 0,
        availability: "Full-time"
      )
    end

    # Structured conflict payload so the client can turn Claim into an alternate-schedule
    # proposal without recalculating any dates itself.
    def schedule_conflict_result(conflict:, technician_profile:)
      if conflict.indeterminate?
        return {
          error: "One of your current assignments has no confirmed schedule, so this job cannot be claimed.",
          status: :conflict,
          schedule_conflict: true,
          schedule_conflict_details: Schedule::JobAvailabilityClassifier.payload(
            job: @job,
            technician_profile: technician_profile
          )
        }
      end

      details = Schedule::JobAvailabilityClassifier.payload(job: @job, technician_profile: technician_profile)
      message =
        if details[:options].empty?
          "This job overlaps an assignment you already have and no alternate schedule fits its constraints."
        else
          SCHEDULE_CONFLICT_MESSAGE
        end

      {
        error: message,
        status: :conflict,
        schedule_conflict: true,
        schedule_conflict_details: details
      }
    end

    def apply_offer_terms!
      @previous_terms = {
        hourly_rate_cents: @job.hourly_rate_cents,
        hours_per_day: @job.hours_per_day,
        days: @job.days,
        start_mode: @job.start_mode,
        scheduled_start_at: @job.scheduled_start_at,
        scheduled_end_at: @job.scheduled_end_at,
        agreed_hourly_rate_cents: @job.agreed_hourly_rate_cents,
        estimated_hours: @job.estimated_hours,
        agreed_labor_cents: @job.agreed_labor_cents,
        financial_revision: @job.financial_revision
      }
      # effective_* falls back to the job's current terms, so a schedule-only proposal does
      # not wipe the agreed pay (and a pay-only counteroffer does not wipe the schedule).
      JobFundingAdjustmentService.apply_accepted_terms!(
        job: @job,
        hourly_rate_cents: @offer.effective_hourly_rate_cents,
        hours_per_day: @offer.effective_hours_per_day,
        days: @offer.effective_days
      )
      @job.assign_attributes(
        start_mode: @offer.proposed_start_mode,
        scheduled_start_at: @offer.effective_start_at,
        scheduled_end_at: @offer.effective_end_at
      )
      if @job.rolling_start? && (@job.rolling_start_rule_type.blank? || @job.rolling_start_rule_type == "none")
        @job.rolling_start_rule_type = :exact_datetime
        @job.rolling_start_exact_start_at = Time.current
      end
      @job.save!
    end

    def revert_offer_terms!
      return if @previous_terms.blank?

      @job.update!(@previous_terms)
      @previous_terms = nil
    end

    def ensure_schedule_for_start_mode!
      return if @job.hard_start?

      start_at = resolved_rolling_start_at
      raise ArgumentError, "A start date/time is required for this rolling-start job." if start_at.blank?

      @job.scheduled_start_at = start_at
      @job.scheduled_end_at = derived_end_at(start_at)
      @job.save!
    rescue ArgumentError => e
      @schedule_error_message = e.message
    end

    def derived_end_at(start_at)
      Schedule::ExpectedCompletionCalculator.call(
        start_at: start_at,
        work_days_count: @job.days,
        hours_per_day: @job.hours_per_day,
        scheduled_weekdays: @job.standard_work_days,
        timezone: @job.job_timezone
      )
    end

    def schedule_invalid?
      @schedule_error_message.present? || @job.scheduled_start_at.blank? || @job.scheduled_end_at.blank?
    end

    def schedule_error_message
      @schedule_error_message || "This job has no scheduled times. The company must set start and end times before technicians can claim it."
    end

    def resolved_rolling_start_at
      now = Time.current

      case @job.rolling_start_rule_type.to_s
      when "exact_datetime"
        start_at = @job.rolling_start_exact_start_at
        raise ArgumentError, "This rolling-start job is missing its required exact start date/time." if start_at.blank?
        return start_at
      when "days_after_acceptance"
        days = @job.rolling_start_days_after_acceptance.to_i
        raise ArgumentError, "This rolling-start job is missing its days-after-acceptance setting." if days <= 0
        return now + days.days
      when "following_weekday"
        weekday = @job.rolling_start_weekday
        raw_time = @job.rolling_start_weekday_time.to_s
        raise ArgumentError, "This rolling-start job is missing its weekday rule." if weekday.blank?
        hh, mm = raw_time.split(":").map(&:to_i)
        raise ArgumentError, "This rolling-start job is missing its weekday start time." unless raw_time.match?(/\A\d{2}:\d{2}\z/)
        delta_days = (weekday.to_i - now.wday) % 7
        delta_days = 7 if delta_days.zero?
        target_day = now.to_date + delta_days.days
        return Time.zone.local(target_day.year, target_day.month, target_day.day, hh, mm, 0)
      else
        raise ArgumentError, "This rolling-start job is missing a company-defined start rule. Ask the company to update the job schedule."
      end
    end
  end
end
