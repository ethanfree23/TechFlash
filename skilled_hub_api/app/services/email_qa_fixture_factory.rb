# frozen_string_literal: true

class EmailQaFixtureFactory
  def initialize(admin_user:)
    @admin_user = admin_user
  end

  def build
    company_user = find_or_create_user!(
      "email-qa-company@example.com",
      role: :company
    )
    company_profile = find_or_create_company_profile!(company_user)

    technician_user = find_or_create_user!(
      "email-qa-technician@example.com",
      role: :technician
    )
    technician_profile = find_or_create_technician_profile!(technician_user)
    ensure_membership_levels!(company_profile, technician_profile)

    job = find_or_create_job!(company_profile)
    application = find_or_create_accepted_application!(job, technician_profile)
    conversation = find_or_create_conversation!(job, technician_profile, company_profile)
    message = find_or_create_message!(conversation, technician_profile)
    rating = find_or_create_rating!(job, company_profile, technician_profile)
    issue_report = find_or_create_issue_report!(job, @admin_user)
    feedback_submission = find_or_create_feedback_submission!(@admin_user)
    offer = find_or_create_offer!(job, technician_profile, company_profile)

    ensure_password_reset_token!(@admin_user)

    {
      admin_user: @admin_user,
      company_user: company_user,
      company_profile: company_profile,
      technician_user: technician_user,
      technician_profile: technician_profile,
      job: job,
      application: application,
      conversation: conversation,
      message: message,
      rating: rating,
      issue_report: issue_report,
      feedback_submission: feedback_submission,
      offer: offer
    }
  end

  private

  def find_or_create_user!(email, role:)
    user = User.find_or_initialize_by(email: email)
    return user if user.persisted?

    user.password = "password123"
    user.password_confirmation = "password123"
    user.role = role
    user.save!
    user
  end

  def find_or_create_company_profile!(company_user)
    profile = company_user.company_profile
    return profile if profile.present?

    CompanyProfile.create!(
      user: company_user,
      company_name: "Email QA Company",
      phone: "713-555-0100",
      membership_level: "basic",
      service_cities: ["Austin"]
    )
  end

  def find_or_create_technician_profile!(technician_user)
    profile = technician_user.technician_profile
    return profile if profile.present?

    TechnicianProfile.create!(
      user: technician_user,
      trade_type: "General",
      availability: "Full-time",
      phone: "713-555-0101",
      membership_level: "basic",
      experience_years: 5,
      city: "Austin",
      state: "Texas",
      country: "United States"
    )
  end

  def find_or_create_job!(company_profile)
    job = Job.where(company_profile_id: company_profile.id, title: "Email QA Job").order(id: :desc).first
    return job if job.present?

    Job.create!(
      company_profile: company_profile,
      title: "Email QA Job",
      description: "Fixture job for email QA previews and sends",
      status: :open,
      go_live_at: 2.days.ago,
      start_mode: :hard_start,
      scheduled_start_at: 1.day.from_now,
      scheduled_end_at: 2.days.from_now,
      hourly_rate_cents: 3_500,
      hours_per_day: 8,
      days: 2
    )
  end

  def find_or_create_accepted_application!(job, technician_profile)
    accepted = job.job_applications.find_by(status: :accepted)
    return accepted if accepted.present?

    job.job_applications.find_or_create_by!(
      technician_profile: technician_profile,
      status: :accepted
    )
  end

  def find_or_create_conversation!(job, technician_profile, company_profile)
    Conversation.where(
      job_id: job.id,
      technician_profile_id: technician_profile.id,
      company_profile_id: company_profile.id
    ).order(id: :desc).first || Conversation.create!(
      job: job,
      technician_profile: technician_profile,
      company_profile: company_profile,
      conversation_type: Conversation::TYPE_JOB
    )
  end

  def find_or_create_message!(conversation, technician_profile)
    conversation.messages.order(id: :desc).first || Message.create!(
      conversation: conversation,
      sender: technician_profile,
      content: "Fixture message for email QA."
    )
  end

  def find_or_create_rating!(job, company_profile, technician_profile)
    Rating.where(job_id: job.id).order(id: :desc).first || Rating.create!(
      job: job,
      reviewer: company_profile,
      reviewee: technician_profile,
      score: 5,
      comment: "Great work, dependable communication, and followed site safety expectations throughout the shift.",
      category_scores: Rating::COMPANY_REVIEW_CATEGORIES.keys.index_with { 5 }.transform_keys(&:to_s),
      would_hire_again: true,
      would_recommend: true,
      on_time_status: :on_time,
      request_again: true
    )
  end

  def find_or_create_issue_report!(job, reporter)
    JobIssueReport.where(job_id: job.id, user_id: reporter.id).order(id: :desc).first || JobIssueReport.create!(
      job: job,
      user: reporter,
      body: "Fixture issue report for email QA."
    )
  end

  def find_or_create_feedback_submission!(sender)
    FeedbackSubmission.where(user_id: sender.id, kind: "suggestion").order(id: :desc).first || FeedbackSubmission.create!(
      user: sender,
      kind: "suggestion",
      body: "Fixture suggestion for email QA",
      page_path: "/settings"
    )
  end

  def find_or_create_offer!(job, technician_profile, company_profile)
    JobCounterOffer.where(job_id: job.id).order(id: :desc).first || JobCounterOffer.create!(
      job: job,
      technician_profile: technician_profile,
      company_profile: company_profile,
      status: :pending_company,
      created_by_role: :technician,
      proposed_hourly_rate_cents: 4_000,
      proposed_hours_per_day: 8,
      proposed_days: 2,
      proposed_start_mode: :rolling_start
    )
  end

  def ensure_password_reset_token!(user)
    return if user.password_reset_token_active?

    user.generate_password_reset_token!
  end

  def ensure_membership_levels!(company_profile, technician_profile)
    company_profile.update_column(:phone, "713-555-0100") if company_profile.phone.blank?
    technician_profile.update_column(:phone, "713-555-0101") if technician_profile.phone.blank?

    company_target = MembershipPolicy.level_valid?("pro", audience: :company) ? "pro" : MembershipPolicy.default_slug_for(:company)
    technician_target = MembershipPolicy.level_valid?("premium", audience: :technician) ? "premium" : MembershipPolicy.default_slug_for(:technician)
    company_profile.update!(membership_level: company_target) if company_profile.membership_level != company_target
    technician_profile.update!(membership_level: technician_target) if technician_profile.membership_level != technician_target
  end
end
