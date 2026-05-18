# frozen_string_literal: true

class MailAuditCatalog
  ACTIVE_EMAILS = [
    {
      key: "welcome_email",
      name: "Welcome email",
      trigger: "User signs up",
      status: "active",
      source: "Api::V1::UsersController#create"
    },
    {
      key: "password_reset_instructions",
      name: "Password reset instructions",
      trigger: "User requests forgot-password reset",
      status: "active",
      source: "Api::V1::PasswordResetsController#create"
    },
    {
      key: "admin_account_setup",
      name: "Admin account setup",
      trigger: "Admin provisions a user or resends password setup email",
      status: "active",
      source: "AdminAccountProvisioner, Api::V1::Admin::UsersController#password_setup"
    },
    {
      key: "membership_checkout_thanks",
      name: "Membership signup thanks",
      trigger: "Paid membership checkout completes",
      status: "conditional",
      source: "Api::V1::StripeWebhooksController#create (checkout.session.completed)"
    },
    {
      key: "membership_invoice_paid_notice",
      name: "Membership invoice paid",
      trigger: "Recurring membership invoice is paid",
      status: "conditional",
      source: "Api::V1::StripeWebhooksController#create (invoice.paid)"
    },
    {
      key: "job_posted_email",
      name: "Job posted",
      trigger: "Company/admin creates a job",
      status: "active",
      source: "Api::V1::JobsController#create"
    },
    {
      key: "job_claimed_email",
      name: "Job claimed (company notice)",
      trigger: "Technician successfully claims a job",
      status: "active",
      source: "Jobs::ClaimJobService"
    },
    {
      key: "payment_confirmation_email",
      name: "Payment confirmation (company)",
      trigger: "Paid claim flow completes",
      status: "conditional",
      source: "Jobs::ClaimJobService"
    },
    {
      key: "technician_claimed_job_email",
      name: "Technician claimed job confirmation",
      trigger: "Technician successfully claims a job",
      status: "active",
      source: "Jobs::ClaimJobService"
    },
    {
      key: "job_completed_for_company",
      name: "Job completed (company)",
      trigger: "Job is marked finished",
      status: "active",
      source: "Api::V1::JobsController#finish"
    },
    {
      key: "job_completed_for_technician",
      name: "Job completed (technician)",
      trigger: "Job is marked finished",
      status: "active",
      source: "Api::V1::JobsController#finish"
    },
    {
      key: "new_message",
      name: "New message notification",
      trigger: "New message on a job thread",
      status: "conditional",
      source: "Api::V1::MessagesController#create"
    },
    {
      key: "payment_received_email",
      name: "Payment received (technician)",
      trigger: "Held funds are released to technician",
      status: "conditional",
      source: "PaymentService.release_to_technician"
    },
    {
      key: "review_received_email",
      name: "Review received",
      trigger: "A review is submitted",
      status: "active",
      source: "Api::V1::RatingsController#create"
    },
    {
      key: "review_reminder_email",
      name: "Review reminder",
      trigger: "Scheduled reminder task for missing reviews",
      status: "conditional",
      source: "lib/tasks/review_reminders.rake"
    },
    {
      key: "job_issue_report",
      name: "Job issue report (admin notice)",
      trigger: "Company/technician submits an issue report",
      status: "conditional",
      source: "Api::V1::JobIssueReportsController#create"
    },
    {
      key: "admin_feedback",
      name: "Admin feedback/suggestion report",
      trigger: "Feedback submission is created",
      status: "conditional",
      source: "Api::V1::FeedbackSubmissionsController#create"
    },
    {
      key: "job_counter_offer_received_email",
      name: "Counter offer received",
      trigger: "A counter offer is created",
      status: "active",
      source: "Api::V1::JobCounterOffersController#create"
    },
    {
      key: "job_counter_offer_accepted_email",
      name: "Counter offer accepted",
      trigger: "A counter offer is accepted",
      status: "active",
      source: "Api::V1::JobCounterOffersController#accept"
    },
    {
      key: "job_counter_offer_declined_email",
      name: "Counter offer declined",
      trigger: "A counter offer is declined",
      status: "active",
      source: "Api::V1::JobCounterOffersController#decline"
    },
    {
      key: "job_counter_offer_countered_email",
      name: "Counter offer updated",
      trigger: "A counter offer is countered",
      status: "active",
      source: "Api::V1::JobCounterOffersController#counter"
    }
  ].freeze

  # Admin-composed / manual sends (not fired by app events).
  MANUAL_EMAILS = [
    {
      key: "crm_sales_call_follow_up",
      name: "CRM sales call follow-up",
      trigger: "Admin sends from CRM company record (Send email)",
      status: "active",
      source: "Api::V1::Admin::CrmLeadsController#send_email"
    }
  ].freeze

  INACTIVE_EMAILS = [
    {
      key: "job_accepted_email",
      name: "Job accepted (orphaned method)",
      trigger: "No current call site",
      status: "inactive",
      source: "UserMailer#job_accepted_email"
    }
  ].freeze

  def self.as_json
    {
      live_automations: ACTIVE_EMAILS,
      manual_emails: MANUAL_EMAILS,
      inactive_automations: INACTIVE_EMAILS
    }
  end
end
