# frozen_string_literal: true

module AppReview
  # Idempotent, production-safe prep for Apple App Review walkthrough data.
  # Touches only the dedicated reviewer company/technician accounts and their
  # "App Review Demo Job" / conversation. Does not charge Stripe, order Checkr,
  # or mutate unrelated customer jobs.
  class PrepareService
    DEMO_JOB_TITLE = "App Review Demo Job"
    COMPANY_EMAIL = ENV.fetch("APP_REVIEW_COMPANY_EMAIL", "review.company.20260804173342@techflash.app")
    TECH_EMAIL = ENV.fetch("APP_REVIEW_TECH_EMAIL", "review.tech.20260804173342@techflash.app")

    Result = Struct.new(
      :company_email,
      :tech_email,
      :job_id,
      :conversation_id,
      :claimable,
      :warnings,
      keyword_init: true
    )

    def self.call!
      new.call!
    end

    def call!
      company_user = User.find_by(email: COMPANY_EMAIL)
      tech_user = User.find_by(email: TECH_EMAIL)
      raise "Missing company reviewer #{COMPANY_EMAIL}" unless company_user&.company?
      raise "Missing technician reviewer #{TECH_EMAIL}" unless tech_user&.technician?

      company = company_user.company_profile || raise("Company reviewer missing company_profile")
      tech = tech_user.technician_profile || raise("Technician reviewer missing technician_profile")

      warnings = []
      repair_company!(company)
      repair_technician!(tech)
      clear_mutual_blocks!(company_user, tech_user)

      job = ensure_open_demo_job!(company, tech)
      conversation = ensure_conversation!(job, company, tech)
      claimable = verify_claimable!(job, tech, warnings)

      Result.new(
        company_email: COMPANY_EMAIL,
        tech_email: TECH_EMAIL,
        job_id: job.id,
        conversation_id: conversation.id,
        claimable: claimable,
        warnings: warnings
      )
    end

    private

    def repair_company!(company)
      company.update!(
        job_funding_waived: true,
        company_name: company.company_name.presence || "App Review Demo Co",
        industry: company.industry.presence || "Electrician"
      )
    end

    def repair_technician!(tech)
      tech.update!(
        trade_type: tech.trade_type.presence || "Electrician",
        skill_class: tech.skill_class.presence || "journeyman",
        membership_level: "premium",
        membership_fee_waived: true,
        experience_years: [tech.experience_years.to_i, 3].max,
        availability: tech.availability.presence || "Full-time",
        city: tech.city.presence || "Houston",
        state: tech.state.presence || "TX",
        location: tech.location.presence || "Houston, TX, United States"
      )
    end

    def clear_mutual_blocks!(company_user, tech_user)
      company_ids = company_user.blocked_user_ids - [tech_user.id]
      tech_ids = tech_user.blocked_user_ids - [company_user.id]
      company_user.update_blocked_user_ids!(company_ids)
      tech_user.update_blocked_user_ids!(tech_ids)
    end

    def ensure_open_demo_job!(company, tech)
      job = Job.where(company_profile_id: company.id, title: DEMO_JOB_TITLE).order(id: :desc).first
      start_at = 3.days.from_now.change(hour: 10, min: 0, sec: 0)
      end_at = start_at + 8.hours

      if job.nil?
        job = Job.create!(
          company_profile: company,
          title: DEMO_JOB_TITLE,
          description: "Review-safe demo job for Apple walkthrough. No live customer obligation.",
          location: "Houston, TX",
          address: "100 Main St",
          city: "Houston",
          state: "TX",
          zip_code: "77002",
          country: "United States",
          status: :open,
          trade_type: "Electrician",
          skill_class: "journeyman",
          minimum_years_experience: 0,
          hours_per_day: 8,
          days: 1,
          pay_basis: "actual_hours_worked",
          scheduled_start_at: start_at,
          scheduled_end_at: end_at,
          notes: "App Review sample — not a live customer job.",
          require_background_check: false,
          require_identity_verification: false,
          minimum_verified_references: 0
        )
      else
        reset_demo_job_for_claim!(job, tech, start_at, end_at)
      end

      # update_columns bypasses callbacks that would rewrite go_live_at to Time.current.
      # job_amount_cents / company_charge_cents / tech_payout_cents are derived methods, not columns.
      job.update_columns(
        status: Job.statuses[:open],
        go_live_at: 3.days.ago,
        funding_status: Job.funding_statuses[:funded],
        posted_under_funding_waiver: true,
        price_cents: nil,
        hourly_rate_cents: nil,
        agreed_hourly_rate_cents: nil,
        agreed_labor_cents: nil,
        require_background_check: false,
        require_identity_verification: false,
        minimum_verified_references: 0,
        finished_at: nil,
        terminated_at: nil,
        updated_at: Time.current
      )
      job.reload
    end

    def reset_demo_job_for_claim!(job, tech, start_at, end_at)
      # Safe only because this is the dedicated App Review demo job title on the reviewer company.
      JobApplication.where(job_id: job.id).find_each do |app|
        # Drop accepted/requested claims so the job can be claimed again during re-recording.
        if app.technician_profile_id == tech.id || app.accepted? || app.requested?
          app.destroy!
        end
      end

      job.update!(
        scheduled_start_at: start_at,
        scheduled_end_at: end_at,
        trade_type: "Electrician",
        skill_class: "journeyman",
        minimum_years_experience: 0,
        notes: "App Review sample — not a live customer job."
      )
    end

    def ensure_conversation!(job, company, tech)
      conversation = Conversation.find_by(
        job_id: job.id,
        technician_profile_id: tech.id,
        company_profile_id: company.id
      )
      conversation ||= Conversation.create!(
        conversation_type: Conversation::TYPE_JOB,
        job_id: job.id,
        technician_profile_id: tech.id,
        company_profile_id: company.id,
        inbox_status: "open",
        priority: "normal"
      )

      if conversation.messages.none?
        Message.create!(
          conversation: conversation,
          sender: company,
          content: "Welcome — this is a sample App Review conversation."
        )
        Message.create!(
          conversation: conversation,
          sender: tech,
          content: "Technician sample reply for App Review messaging demo."
        )
      end

      conversation
    end

    def verify_claimable!(job, tech, warnings)
      unless MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: tech)
        warnings << "Job #{job.id} is not visible to reviewer technician under MembershipPolicy"
        return false
      end

      gate = VerificationEligibilityService.call(job: job, technician_profile: tech)
      unless gate.eligible
        warnings << "Verification gate blocked claim: #{Array(gate.reasons).join(', ')}"
        return false
      end

      unless job.funding_allows_claim?
        warnings << "Job #{job.id} funding_allows_claim? is false"
        return false
      end

      unless job.available_for_claim?
        warnings << "Job #{job.id} available_for_claim? is false (status=#{job.status})"
        return false
      end

      true
    end
  end
end
