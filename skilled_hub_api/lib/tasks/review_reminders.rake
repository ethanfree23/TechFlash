# frozen_string_literal: true

namespace :skilled_hub do
  desc 'Send review reminder emails to users who completed jobs 3+ days ago but have not reviewed'
  task review_reminders: :environment do
    # Jobs finished 3-7 days ago (remind once in that window)
    window_start = 3.days.ago
    window_end = 7.days.ago

    Job.where(status: [:finished, :filled])
      .where('finished_at <= ? AND finished_at >= ?', window_start, window_end)
      .find_each do |job|
        company_profile = job.company_profile
        accepted_app = job.job_applications.find_by(status: :accepted)
        technician_profile = accepted_app&.technician_profile
        next unless technician_profile

        # Remind company if they haven't reviewed
        unless Rating.exists?(job: job, reviewer: company_profile)
          UserMailer.review_reminder_email(job, company_profile.user, :company).deliver_later
        end

        # Remind technician if they haven't reviewed
        unless Rating.exists?(job: job, reviewer: technician_profile)
          UserMailer.review_reminder_email(job, technician_profile.user, :technician).deliver_later
        end
      end

    puts "Review reminders queued."
  end
end
