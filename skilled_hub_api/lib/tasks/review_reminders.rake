# frozen_string_literal: true

namespace :skilled_hub do
  desc "Send staged review reminder emails during 14-day review window"
  task review_reminders: :environment do
    reminder_days = [1, 3, 7, 13]
    now = Time.current

    reminder_days.each do |day_offset|
      window_end = now - day_offset.days
      window_start = window_end - 1.day

      Job.where(status: [:finished, :filled])
        .where("finished_at <= ? AND finished_at >= ?", window_end, window_start)
        .find_each do |job|
        company_profile = job.company_profile
        accepted_app = job.job_applications.find_by(status: :accepted)
        technician_profile = accepted_app&.technician_profile
        next unless technician_profile

        # Remind company if they haven't reviewed and have not been reminded in the last 24h.
        unless Rating.exists?(job: job, reviewer: company_profile) || recent_reminder_sent?(company_profile.user&.email)
          MailDelivery.safe_deliver { UserMailer.review_reminder_email(job, company_profile.user, :company).deliver_now }
        end

        # Remind technician if they haven't reviewed and have not been reminded in the last 24h.
        unless Rating.exists?(job: job, reviewer: technician_profile) || recent_reminder_sent?(technician_profile.user&.email)
          MailDelivery.safe_deliver { UserMailer.review_reminder_email(job, technician_profile.user, :technician).deliver_now }
        end
      end
    end

    puts "Review reminders queued for staged cadence."
  end
end

def recent_reminder_sent?(email)
  return false if email.blank?

  EmailDeliveryLog.where(
    to_email: email,
    mailer_class: "UserMailer",
    mailer_action: "review_reminder_email"
  ).where("created_at >= ?", 24.hours.ago).exists?
end
