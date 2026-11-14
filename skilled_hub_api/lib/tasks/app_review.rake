# frozen_string_literal: true

namespace :app_review do
  REVIEW_COMPANY_EMAIL = ENV.fetch("APP_REVIEW_COMPANY_EMAIL", "review.company.20260804173342@techflash.app")
  REVIEW_TECH_EMAIL = ENV.fetch("APP_REVIEW_TECH_EMAIL", "review.tech.20260804173342@techflash.app")
  REVIEW_PASSWORD = ENV.fetch("APP_REVIEW_PASSWORD", "TfReview!2026")

  desc "Prepare App Store review sample data (review accounts, claimable job, conversation). Safe for production."
  task prepare: :environment do
    company_user = User.find_by(email: REVIEW_COMPANY_EMAIL)
    tech_user = User.find_by(email: REVIEW_TECH_EMAIL)

    raise "Missing company reviewer #{REVIEW_COMPANY_EMAIL}" unless company_user&.company?
    raise "Missing technician reviewer #{REVIEW_TECH_EMAIL}" unless tech_user&.technician?

    company = company_user.company_profile || raise("Company reviewer missing company_profile")
    tech = tech_user.technician_profile || raise("Technician reviewer missing technician_profile")

    company.update!(
      job_funding_waived: true,
      company_name: company.company_name.presence || "App Review Demo Co",
      industry: company.industry.presence || "Electrician"
    )

    tech.update!(
      trade_type: tech.trade_type.presence || "Electrician",
      skill_class: tech.skill_class.presence || "journeyman",
      membership_level: "premium",
      membership_fee_waived: true,
      experience_years: [tech.experience_years.to_i, 3].max,
      city: tech.city.presence || "Houston",
      state: tech.state.presence || "TX",
      location: tech.location.presence || "Houston, TX, United States"
    )

    start_at = 3.days.from_now.change(hour: 10, min: 0, sec: 0)
    end_at = start_at + 8.hours

    job = Job.where(company_profile_id: company.id, title: "App Review Demo Job").order(id: :desc).first
    if job.nil? || %w[finished completed cancelled].include?(job.status.to_s)
      job = Job.create!(
        company_profile: company,
        title: "App Review Demo Job",
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
    end

    # Bypass early-access window and ensure claim visibility for basic/premium reviewers.
    job.update_columns(
      status: Job.statuses[:open],
      go_live_at: 3.days.ago,
      funding_status: Job.funding_statuses[:funded],
      posted_under_funding_waiver: true,
      price_cents: nil,
      hourly_rate_cents: nil,
      updated_at: Time.current
    )

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
      inbox_category: "job",
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

    puts "app_review:prepare complete"
    puts "  company: #{REVIEW_COMPANY_EMAIL}"
    puts "  technician: #{REVIEW_TECH_EMAIL}"
    puts "  password: (APP_REVIEW_PASSWORD / documented review password)"
    puts "  job_id: #{job.id} status=#{job.reload.status} go_live_at=#{job.go_live_at}"
    puts "  conversation_id: #{conversation.id}"
    puts "  tech membership: #{tech.reload.membership_level} waived=#{tech.membership_fee_waived}"
    puts "  company funding waiver: #{company.reload.job_funding_waived}"
    puts "NOTE: Password is not rotated by this task. Confirm APP_STORE_REVIEW_NOTES.md credentials still work."
  end

  desc "Print App Review credentials checklist (does not print password unless SHOW_PASSWORD=1)"
  task status: :environment do
    company_user = User.find_by(email: REVIEW_COMPANY_EMAIL)
    tech_user = User.find_by(email: REVIEW_TECH_EMAIL)
    puts "company present=#{company_user.present?} role=#{company_user&.role}"
    puts "technician present=#{tech_user.present?} role=#{tech_user&.role}"
    if company_user&.company_profile
      cp = company_user.company_profile
      open_jobs = Job.where(company_profile_id: cp.id, status: :open).count
      puts "company open jobs=#{open_jobs} funding_waived=#{cp.job_funding_waived}"
    end
    if tech_user&.technician_profile
      tp = tech_user.technician_profile
      puts "tech trade=#{tp.trade_type} class=#{tp.skill_class} membership=#{tp.membership_level}"
      puts "tech conversations=#{Conversation.where(technician_profile_id: tp.id).count}"
    end
    if ENV["SHOW_PASSWORD"] == "1"
      puts "password=#{REVIEW_PASSWORD}"
    end
  end
end
