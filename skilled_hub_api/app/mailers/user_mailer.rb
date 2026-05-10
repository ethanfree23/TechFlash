# frozen_string_literal: true

class UserMailer < ApplicationMailer
  default from: ENV.fetch('MAILER_FROM', 'noreply@techflash.example.com')

  def welcome_email(user)
    @user = user
    @email = user.email
    @membership_context = membership_context_for(user)
    return unless notifications_enabled_for?(@user, :membership_updates)
    mail(to: @email, subject: 'Welcome to TechFlash!')
  end

  # Sent when an admin provisions a user or resends the setup link (same URL as forgot-password flow).
  def admin_account_setup_email(user)
    @user = user
    @reset_url = frontend_reset_password_url(user.password_reset_token)
    @membership_context = membership_context_for(user)
    mail(to: user.email, subject: 'Welcome aboard — your TechFlash account is ready')
  end

  # Forgot-password / self-service reset only.
  def password_reset_instructions(user)
    @user = user
    @reset_url = frontend_reset_password_url(user.password_reset_token)
    mail(to: user.email, subject: 'Reset your TechFlash password')
  end

  def job_posted_email(job)
    @job = job
    @user = job.company_profile.user
    @company_name = job.company_profile.company_name || 'Your company'
    return unless notifications_enabled_for?(@user, :job_lifecycle)
    mail(to: @user.email, subject: "Job posted: #{job.title}")
  end

  def job_alert_email(user, job, technician_profile: nil)
    @user = user
    @job = job
    @job_alert_hourly_rate = format_hourly_rate(@job)
    @job_alert_estimated_total = format_estimated_total(@job)
    @job_alert_duration = format_business_day_duration(@job)
    @job_alert_distance = format_distance_from_technician(@job, technician_profile)
    return unless notifications_enabled_for?(user, :job_lifecycle)

    mail(to: user.email, subject: "New matching job: #{job.title}")
  end

  def job_claimed_email(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician = accepted_app&.technician_profile
    @company_user = job.company_profile.user
    return unless notifications_enabled_for?(@company_user, :job_lifecycle)
    mail(to: @company_user.email, subject: "Your job \"#{job.title}\" was claimed")
  end

  def job_accepted_email(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank? || !notifications_enabled_for?(@technician_user, :job_lifecycle)
    mail(to: @technician_user.email, subject: "Company accepted you for: #{job.title}")
  end

  def new_message(message)
    @message = message
    @conversation = message.conversation
    @job = @conversation.job
    @sender = case message.sender
              when TechnicianProfile then message.sender.user
              when CompanyProfile then message.sender.user
              else nil
              end
    @recipient = recipient_for_message(message)
    return if @recipient.blank? || !notifications_enabled_for?(@recipient, :messages)
    mail(to: @recipient.email, subject: "New message about #{@job.title}")
  end

  def payment_confirmation_email(job, amount_cents)
    @job = job
    @amount = amount_cents / 100.0
    @user = job.company_profile.user
    @membership_context = membership_context_for(@user)
    mail(to: @user.email, subject: "Payment confirmation: #{job.title} - $#{format('%.2f', @amount)}")
  end

  def payment_received_email(job, amount_cents)
    @job = job
    @amount = amount_cents / 100.0
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank?
    @membership_context = membership_context_for(@technician_user)
    mail(to: @technician_user.email, subject: "You were paid $#{format('%.2f', @amount)} for #{job.title}")
  end

  def membership_checkout_thanks(user, membership_level: nil)
    @user = user
    @membership_context = membership_context_for(user, membership_level_override: membership_level)
    @dashboard_url = frontend_url('/settings')
    return unless notifications_enabled_for?(user, :membership_updates)
    mail(to: user.email, subject: "Thanks for signing up for #{@membership_context[:tier_name]} membership")
  end

  def membership_invoice_paid_notice(user:, amount_cents:, period_start: nil, period_end: nil, hosted_invoice_url: nil, invoice_number: nil)
    @user = user
    @membership_context = membership_context_for(user)
    @amount = amount_cents.to_i / 100.0
    @period_start = period_start
    @period_end = period_end
    @hosted_invoice_url = hosted_invoice_url.to_s.presence
    @invoice_number = invoice_number.to_s.presence
    @settings_url = frontend_url('/settings')
    mail(to: user.email, subject: "Membership payment received#{@invoice_number.present? ? " (#{@invoice_number})" : ''}")
  end

  def review_received_email(rating)
    @rating = rating
    @job = rating.job
    @reviewee_user = case rating.reviewee
                     when TechnicianProfile then rating.reviewee.user
                     when CompanyProfile then rating.reviewee.user
                     else nil
                     end
    return if @reviewee_user.blank? || !notifications_enabled_for?(@reviewee_user, :reviews)
    mail(to: @reviewee_user.email, subject: "You received a new review for #{@job.title}")
  end

  def review_reminder_email(job, user, role)
    @job = job
    @user = user
    @role = role # :technician or :company
    @other_party = role == :technician ? (job.company_profile.company_name || 'the company') : 'the technician'
    return unless notifications_enabled_for?(user, :reviews)
    mail(to: user.email, subject: "Reminder: Leave a review for #{job.title}")
  end

  def job_completed_for_company(job)
    @job = job
    @company_user = job.company_profile.user
    return unless notifications_enabled_for?(@company_user, :job_lifecycle)
    mail(to: @company_user.email, subject: "Job marked complete: #{job.title}")
  end

  def job_completed_for_technician(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank? || !notifications_enabled_for?(@technician_user, :job_lifecycle)

    mail(to: @technician_user.email, subject: "Job marked complete: #{job.title}")
  end

  def technician_claimed_job_email(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank? || !notifications_enabled_for?(@technician_user, :job_lifecycle)

    mail(to: @technician_user.email, subject: "You claimed: #{job.title}")
  end

  def job_issue_report(report)
    @report = report
    @job = report.job
    @reporter = report.user
    admin_emails = User.where(role: :admin, email_notifications_enabled: true).pluck(:email).compact.uniq
    return if admin_emails.empty?

    mail(
      to: admin_emails,
      subject: "[TechFlash] Job issue — Job ##{@job.id} (#{@job.title})"
    )
  end

  def job_counter_offer_received_email(offer)
    @offer = offer
    @job = offer.job
    recipient = offer.pending_company? ? offer.company_profile.user : offer.technician_profile.user
    return unless notifications_enabled_for?(recipient, :job_lifecycle)
    mail(to: recipient.email, subject: "New counter offer for #{@job.title}")
  end

  def job_counter_offer_accepted_email(offer)
    @offer = offer
    @job = offer.job
    recipients = notification_recipients(:job_lifecycle, offer.company_profile.user, offer.technician_profile.user)
    return if recipients.empty?
    mail(to: recipients, subject: "Counter offer accepted: #{@job.title}")
  end

  def job_counter_offer_declined_email(offer)
    @offer = offer
    @job = offer.job
    recipient = offer.created_by_role == "technician" ? offer.technician_profile.user : offer.company_profile.user
    return unless notifications_enabled_for?(recipient, :job_lifecycle)
    mail(to: recipient.email, subject: "Counter offer declined: #{@job.title}")
  end

  def job_counter_offer_countered_email(offer)
    @offer = offer
    @job = offer.job
    recipient = offer.pending_company? ? offer.company_profile.user : offer.technician_profile.user
    return unless notifications_enabled_for?(recipient, :job_lifecycle)
    mail(to: recipient.email, subject: "Counter offer update for #{@job.title}")
  end

  def admin_feedback(submission)
    @submission = submission
    @sender = submission.user
    admin_emails = User.where(role: :admin, email_notifications_enabled: true).pluck(:email).compact.uniq
    return if admin_emails.empty?

    kind_label = submission.kind == 'problem' ? 'Problem report' : 'Suggestion'
    mail(
      to: admin_emails,
      subject: "[TechFlash] #{kind_label} from #{@sender.email}"
    )
  end

  private

  def frontend_reset_password_url(token)
    base = ENV.fetch('FRONTEND_URL', 'http://localhost:5173').chomp('/')
    "#{base}/reset-password?token=#{CGI.escape(token)}"
  end

  def recipient_for_message(message)
    conv = message.conversation
    sender = message.sender
    if sender.is_a?(TechnicianProfile)
      conv.company_profile.user
    else
      conv.technician_profile.user
    end
  end

  def notifications_enabled_for?(user, category = nil)
    return false unless user.present?
    return false unless user.email_notifications_enabled?
    return true if category.blank?

    user.email_notification_enabled_for?(category)
  end

  def notification_recipients(category, *users)
    users.flatten.compact.select { |user| notifications_enabled_for?(user, category) }.map(&:email).uniq
  end

  def membership_context_for(user, membership_level_override: nil)
    return nil unless user&.company? || user&.technician?

    audience = user.company? ? :company : :technician
    profile = user.company? ? user.company_profile : user.technician_profile
    level_slug = membership_level_override.to_s.presence || profile&.membership_level || MembershipPolicy.default_slug_for(audience)
    level_slug = MembershipPolicy.normalized_level(level_slug, audience: audience)
    tier = MembershipTierConfig.find_by(audience: audience.to_s, slug: level_slug)
    fee_cents = if audience == :company
      MembershipPolicy.company_monthly_fee_cents(profile)
    else
      MembershipPolicy.technician_monthly_fee_cents(profile)
    end
    commission_percent = if audience == :company
      MembershipPolicy.company_commission_percent(profile)
    else
      MembershipPolicy.technician_commission_percent(profile)
    end
    {
      audience: audience,
      tier_slug: level_slug,
      tier_name: tier&.display_name.presence || level_slug.to_s.titleize,
      monthly_fee_cents: fee_cents.to_i,
      monthly_fee_display: format("$%.2f", fee_cents.to_i / 100.0),
      commission_percent: commission_percent.to_f,
      commission_display: format("%.2f%%", commission_percent.to_f)
    }
  end

  def format_hourly_rate(job)
    cents = job.hourly_rate_cents.to_i
    return nil if cents <= 0

    "$#{format('%.2f', cents / 100.0)}/hr"
  end

  def format_estimated_total(job)
    amount_cents = job.job_amount_cents.to_i
    return nil if amount_cents <= 0

    "$#{format('%.2f', amount_cents / 100.0)}"
  end

  def format_business_day_duration(job)
    days = job.days.to_i
    return nil if days <= 0

    weeks = (days.to_f / 5.0).ceil
    "#{days} business #{'day'.pluralize(days)} (~#{weeks} #{'week'.pluralize(weeks)})"
  end

  def format_distance_from_technician(job, technician_profile)
    return nil if technician_profile.blank?
    return nil if technician_profile.latitude.blank? || technician_profile.longitude.blank?
    return nil if job.latitude.blank? || job.longitude.blank?

    miles = GeocodingService.distance_miles(
      technician_profile.latitude.to_f,
      technician_profile.longitude.to_f,
      job.latitude.to_f,
      job.longitude.to_f
    )
    "#{format('%.1f', miles)} miles away"
  rescue StandardError
    nil
  end
end
