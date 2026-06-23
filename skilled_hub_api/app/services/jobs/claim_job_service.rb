module Jobs
  class ClaimJobService
    LUNCH_HOURS = 1

    def self.call(job:, technician_user:, offer: nil, preferred_start_at: nil)
      new(job: job, technician_user: technician_user, offer: offer, preferred_start_at: preferred_start_at).call
    end

    def initialize(job:, technician_user:, offer: nil, preferred_start_at: nil)
      @job = job
      @technician_user = technician_user
      @offer = offer
      @preferred_start_at = preferred_start_at
    end

    def call
      return { error: "Only technicians can claim jobs" } unless @technician_user.technician?
      return { error: "Job is no longer available" } unless @job.open?

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

      job_application = JobApplication.create!(
        job: @job,
        technician_profile: technician_profile,
        status: :accepted
      )

      charge_required = @job.job_amount_cents > 0 && !MembershipPolicy.billing_exempt?(@job.company_profile)
      if charge_required
        result = PaymentService.charge_company_on_claim(@job)
        if result[:error]
          job_application.destroy!
          @job.reload
          return { error: result[:error] }
        end
        @job.update!(status: :filled)
        MailDelivery.safe_deliver do
          UserMailer.job_claimed_email(@job).deliver_now
          UserMailer.payment_confirmation_email(@job, @job.company_charge_cents).deliver_now
          UserMailer.technician_claimed_job_email(@job).deliver_now
        end
      else
        @job.update!(status: :filled)
        MailDelivery.safe_deliver do
          UserMailer.job_claimed_email(@job).deliver_now
          UserMailer.technician_claimed_job_email(@job).deliver_now
        end
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
      @job.assign_attributes(
        hourly_rate_cents: @offer.proposed_hourly_rate_cents,
        hours_per_day: @offer.proposed_hours_per_day,
        days: @offer.proposed_days,
        start_mode: @offer.proposed_start_mode,
        scheduled_start_at: @offer.proposed_start_at,
        scheduled_end_at: @offer.proposed_end_at
      )
      @job.save!
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
      days = [@job.days.to_i, 1].max
      hours = [@job.hours_per_day.to_i, 1].max
      end_date = add_business_days(start_at.to_date, days - 1)
      end_day_start = Time.zone.local(
        end_date.year,
        end_date.month,
        end_date.day,
        start_at.hour,
        start_at.min,
        0
      )
      end_day_start + (hours + LUNCH_HOURS).hours
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
        parsed = Time.zone.parse(@preferred_start_at.to_s)
        return parsed if parsed.present?
        return now if @offer.present?
        raise ArgumentError, "Pick a preferred start date/time before claiming this rolling-start job."
      end
    end

    def add_business_days(date, business_days)
      result = date
      remaining = [business_days.to_i, 0].max
      while remaining.positive?
        result += 1.day
        remaining -= 1 unless result.saturday? || result.sunday?
      end
      result
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
