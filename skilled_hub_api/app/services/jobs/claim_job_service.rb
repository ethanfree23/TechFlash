module Jobs
  class ClaimJobService
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

      apply_offer_terms! if @offer.present?
      ensure_schedule_for_start_mode!
      return { error: schedule_error_message } if schedule_invalid?
      return { error: "Job has already been claimed" } if @job.job_applications.accepted.any?
      return { error: overlap_error_message } if overlapping_claim?(technician_profile)

      if @offer.present?
        funding = JobFundingAdjustmentService.reconcile!(@job, source: "counteroffer", transaction_type_prefix: "counteroffer")
        if funding[:requires_action]
          revert_offer_terms! if @previous_terms.present?
          return {
            error: funding[:error] || "Additional payment is required before these terms can be accepted.",
            requires_action: true,
            client_secret: funding[:client_secret],
            payment_adjustment_required: true
          }
        end
        unless funding[:success]
          revert_offer_terms! if @previous_terms.present?
          return { error: funding[:error] || "Could not fund the accepted counteroffer." }
        end
      else
        unless @job.funding_funded? || !@job.priced? || @job.billing_exempt?
          return { error: "This job is not funded yet and cannot be claimed." }
        end
      end

      job_application = JobApplication.create!(
        job: @job,
        technician_profile: technician_profile,
        status: :accepted
      )

      JobFundingService.snapshot_technician!(@job, technician_profile)
      @job.update!(status: :filled)
      MailDelivery.safe_deliver do
        UserMailer.job_claimed_email(@job).deliver_now
        UserMailer.technician_claimed_job_email(@job).deliver_now
      end

      { job: @job }
    end

    private

    def create_default_technician_profile!
      TechnicianProfile.create!(
        user: @technician_user,
        trade_type: "General",
        experience_years: 0,
        availability: "Full-time"
      )
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
      JobFundingAdjustmentService.apply_accepted_terms!(
        job: @job,
        hourly_rate_cents: @offer.proposed_hourly_rate_cents,
        hours_per_day: @offer.proposed_hours_per_day,
        days: @offer.proposed_days
      )
      @job.assign_attributes(
        start_mode: @offer.proposed_start_mode,
        scheduled_start_at: @offer.proposed_start_at,
        scheduled_end_at: @offer.proposed_end_at
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

    def overlapping_claim?(technician_profile)
      technician_profile.job_applications
        .joins(:job)
        .where(job_applications: { status: :accepted })
        .where(jobs: { status: [:reserved, :filled] })
        .where.not(jobs: { id: @job.id })
        .any? { |app| jobs_overlap?(app.job, @job) }
    end

    def overlap_error_message
      "You cannot claim this job because its scheduled time overlaps with another job you've already claimed."
    end

    def jobs_overlap?(job_a, job_b)
      return true if job_a.scheduled_start_at.blank? || job_a.scheduled_end_at.blank? || job_b.scheduled_start_at.blank? || job_b.scheduled_end_at.blank?

      start_a = job_a.scheduled_start_at
      end_a = job_a.scheduled_end_at
      start_b = job_b.scheduled_start_at
      end_b = job_b.scheduled_end_at
      start_a < end_b && end_a > start_b
    end
  end
end
