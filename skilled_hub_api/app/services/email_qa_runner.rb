# frozen_string_literal: true

require "uri"

class EmailQaRunner
  CONFIRMATION_TEXT = "SEND_TEST_EMAILS"

  Template = Struct.new(:key, :name, :description, :active, :automated, :audience, :trigger, :source, keyword_init: true)

  TEMPLATE_DEFS = [
    Template.new(key: "welcome_email", name: "Welcome email", description: "Signup welcome message", active: true, audience: "company/technician", trigger: "User signs up", source: "Api::V1::UsersController#create"),
    Template.new(key: "password_reset_instructions", name: "Password reset instructions", description: "Forgot-password reset email", active: true, audience: "company/technician/admin", trigger: "User requests forgot-password reset", source: "Api::V1::PasswordResetsController#create"),
    Template.new(key: "admin_account_setup", name: "Admin account setup", description: "Welcome aboard when admin creates a user", active: true, audience: "company/technician", trigger: "Admin provisions account or resends setup link", source: "AdminAccountProvisioner, Api::V1::Admin::UsersController#password_setup"),
    Template.new(key: "membership_checkout_thanks", name: "Membership signup thanks", description: "Post-checkout membership confirmation", active: true, audience: "company/technician", trigger: "Stripe checkout.session.completed for paid membership", source: "Api::V1::StripeWebhooksController#create"),
    Template.new(key: "membership_invoice_paid_notice", name: "Membership invoice paid", description: "Membership billing payment confirmation", active: true, audience: "company/technician", trigger: "Stripe invoice.paid for membership", source: "Api::V1::StripeWebhooksController#create"),
    Template.new(key: "job_posted_email", name: "Job posted", description: "Company notice after posting", active: true, audience: "company", trigger: "Company/admin creates a job", source: "Api::V1::JobsController#create"),
    Template.new(key: "job_claimed_email", name: "Job claimed", description: "Company notice after claim", active: true, audience: "company", trigger: "Technician successfully claims a job", source: "Jobs::ClaimJobService"),
    Template.new(key: "payment_confirmation_email", name: "Payment confirmation", description: "Company charge confirmation", active: true, audience: "company", trigger: "Paid claim flow completes", source: "Jobs::ClaimJobService"),
    Template.new(key: "technician_claimed_job_email", name: "Technician claimed job", description: "Technician claim confirmation", active: true, audience: "technician", trigger: "Technician successfully claims a job", source: "Jobs::ClaimJobService"),
    Template.new(key: "job_completed_for_company", name: "Job completed (company)", description: "Completion notice to company", active: true, audience: "company", trigger: "Job is marked finished", source: "Api::V1::JobsController#finish"),
    Template.new(key: "job_completed_for_technician", name: "Job completed (technician)", description: "Completion notice to technician", active: true, audience: "technician", trigger: "Job is marked finished", source: "Api::V1::JobsController#finish"),
    Template.new(key: "new_message", name: "New message notification", description: "Job thread message alert", active: true, audience: "company/technician", trigger: "New message on a job thread", source: "Api::V1::MessagesController#create"),
    Template.new(key: "payment_received_email", name: "Payment received", description: "Technician payout email", active: true, audience: "technician", trigger: "Held funds are released to technician", source: "PaymentService.release_to_technician"),
    Template.new(key: "review_received_email", name: "Review received", description: "Notification after review submission", active: true, audience: "company/technician", trigger: "A review is submitted", source: "Api::V1::RatingsController#create"),
    Template.new(key: "review_reminder_email", name: "Review reminder", description: "Reminder to leave a review", active: true, audience: "company/technician", trigger: "Scheduled reminder task for missing reviews", source: "lib/tasks/review_reminders.rake"),
    Template.new(key: "job_issue_report", name: "Job issue report", description: "Admin issue report alert", active: true, audience: "admin", trigger: "Company/technician submits issue report", source: "Api::V1::JobIssueReportsController#create"),
    Template.new(key: "admin_feedback", name: "Admin feedback", description: "Suggestion/problem submission alert", active: true, audience: "admin", trigger: "Feedback submission is created", source: "Api::V1::FeedbackSubmissionsController#create"),
    Template.new(key: "job_counter_offer_received_email", name: "Counter offer received", description: "Counter offer inbound notice", active: true, audience: "company/technician", trigger: "A counter offer is created", source: "Api::V1::JobCounterOffersController#create"),
    Template.new(key: "job_counter_offer_accepted_email", name: "Counter offer accepted", description: "Counter offer accepted notice", active: true, audience: "company/technician", trigger: "A counter offer is accepted", source: "Api::V1::JobCounterOffersController#accept"),
    Template.new(key: "job_counter_offer_declined_email", name: "Counter offer declined", description: "Counter offer declined notice", active: true, audience: "company/technician", trigger: "A counter offer is declined", source: "Api::V1::JobCounterOffersController#decline"),
    Template.new(key: "job_counter_offer_countered_email", name: "Counter offer updated", description: "Counter offer updated notice", active: true, audience: "company/technician", trigger: "A counter offer is countered", source: "Api::V1::JobCounterOffersController#counter"),
    Template.new(key: "job_accepted_email", name: "Job accepted (inactive)", description: "Defined mailer, not currently auto-triggered", active: false, automated: false, audience: "technician", trigger: "No active trigger", source: "UserMailer#job_accepted_email"),
    Template.new(key: "crm_sales_call_follow_up", name: "CRM sales call follow-up", description: "Admin-composed sales follow-up from CRM", active: true, automated: false, audience: "crm prospect", trigger: "Admin sends from CRM company record", source: "Api::V1::Admin::CrmLeadsController#send_email")
  ].freeze

  def self.templates
    TEMPLATE_DEFS.map do |template|
      {
        key: template.key,
        name: template.name,
        description: template.description,
        active: template.active,
        automated: template.automated != false,
        audience: template.audience,
        trigger: template.trigger,
        source: template.source
      }
    end
  end

  def initialize(admin_user:, to_email: nil)
    @admin_user = admin_user
    @to_email = self.class.normalize_optional_email(to_email)
    @fixtures = EmailQaFixtureFactory.new(admin_user: admin_user).build
  end

  def self.normalize_optional_email(raw)
    s = raw.to_s.strip
    return nil if s.blank?

    unless URI::MailTo::EMAIL_REGEXP.match?(s)
      raise ArgumentError, "Invalid test recipient email address."
    end

    s.downcase
  end

  def preview(template_key)
    mail = build_mail(template_key)
    raise ArgumentError, "Unknown or unavailable template: #{template_key}" if mail.nil?

    template = find_template(template_key)
    {
      template_key: template_key,
      subject: mail.subject.to_s,
      to: [effective_to_email],
      html_body: html_part_of(mail),
      text_body: text_part_of(mail),
      audience: template&.audience,
      trigger: template&.trigger,
      source: template&.source
    }
  end

  def send_one(template_key:, confirmation:)
    ensure_confirmation!(confirmation)
    mail = build_mail(template_key)
    raise ArgumentError, "Unknown or unavailable template: #{template_key}" if mail.nil?

    force_recipient!(mail)
    result = MailDelivery.safe_deliver_result { mail.deliver_now }
    delivered = result[:success]

    out = {
      template_key: template_key,
      delivered: delivered,
      to: [effective_to_email],
      subject: mail.subject.to_s
    }
    out[:mail_error] = result[:error] if delivered == false && result[:error].present?
    out
  end

  def send_all(confirmation:)
    ensure_confirmation!(confirmation)

    TEMPLATE_DEFS.select { |t| t.automated != false && t.active }.map do |template|
      begin
        send_one(template_key: template.key, confirmation: CONFIRMATION_TEXT)
      rescue StandardError => e
        {
          template_key: template.key,
          delivered: false,
          error: e.message
        }
      end
    end
  end

  private

  def effective_to_email
    @to_email.presence || @admin_user.email.to_s.downcase
  end

  def ensure_confirmation!(value)
    return if value.to_s == CONFIRMATION_TEXT

    raise ArgumentError, "Confirmation text is required to send test emails."
  end

  def build_mail(template_key)
    case template_key.to_s
    when "welcome_email"
      UserMailer.welcome_email(@fixtures[:admin_user])
    when "password_reset_instructions"
      UserMailer.password_reset_instructions(@fixtures[:admin_user])
    when "admin_account_setup"
      technician = @fixtures[:technician_user]
      technician.generate_password_reset_token! unless technician.password_reset_token_active?
      UserMailer.admin_account_setup_email(technician)
    when "membership_checkout_thanks"
      UserMailer.membership_checkout_thanks(@fixtures[:company_user], membership_level: @fixtures[:company_profile].membership_level)
    when "membership_invoice_paid_notice"
      UserMailer.membership_invoice_paid_notice(
        user: @fixtures[:company_user],
        amount_cents: 25_000,
        period_start: 1.month.ago.beginning_of_day,
        period_end: Time.current.end_of_day,
        hosted_invoice_url: "https://dashboard.stripe.com/invoices/in_email_qa_fixture",
        invoice_number: "TF-EMAIL-QA-001"
      )
    when "job_posted_email"
      UserMailer.job_posted_email(@fixtures[:job])
    when "job_claimed_email"
      UserMailer.job_claimed_email(@fixtures[:job])
    when "job_accepted_email"
      UserMailer.job_accepted_email(@fixtures[:job])
    when "new_message"
      UserMailer.new_message(@fixtures[:message])
    when "payment_confirmation_email"
      UserMailer.payment_confirmation_email(@fixtures[:job], 12_345)
    when "payment_received_email"
      UserMailer.payment_received_email(@fixtures[:job], 12_345)
    when "review_received_email"
      UserMailer.review_received_email(@fixtures[:rating])
    when "review_reminder_email"
      UserMailer.review_reminder_email(@fixtures[:job], @fixtures[:admin_user], :company)
    when "job_completed_for_company"
      UserMailer.job_completed_for_company(@fixtures[:job])
    when "job_completed_for_technician"
      UserMailer.job_completed_for_technician(@fixtures[:job])
    when "technician_claimed_job_email"
      UserMailer.technician_claimed_job_email(@fixtures[:job])
    when "job_issue_report"
      UserMailer.job_issue_report(@fixtures[:issue_report])
    when "admin_feedback"
      UserMailer.admin_feedback(@fixtures[:feedback_submission])
    when "job_counter_offer_received_email"
      UserMailer.job_counter_offer_received_email(@fixtures[:offer])
    when "job_counter_offer_accepted_email"
      UserMailer.job_counter_offer_accepted_email(@fixtures[:offer])
    when "job_counter_offer_declined_email"
      UserMailer.job_counter_offer_declined_email(@fixtures[:offer])
    when "job_counter_offer_countered_email"
      UserMailer.job_counter_offer_countered_email(@fixtures[:offer])
    when "crm_sales_call_follow_up"
      CrmEmailQaMail.build(admin_user: @admin_user)
    end
  end

  def force_recipient!(mail)
    mail.to = [effective_to_email]
    mail.cc = nil
    mail.bcc = nil
  end

  def find_template(template_key)
    TEMPLATE_DEFS.find { |template| template.key == template_key.to_s }
  end

  def html_part_of(mail)
    part = mail.html_part
    return part.body.decoded if part
    return mail.body.decoded if mail.content_type.to_s.include?("text/html")

    ""
  end

  def text_part_of(mail)
    part = mail.text_part
    return part.body.decoded if part
    return mail.body.decoded if mail.content_type.to_s.include?("text/plain")

    ""
  end
end
