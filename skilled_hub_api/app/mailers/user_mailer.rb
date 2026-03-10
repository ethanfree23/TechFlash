# frozen_string_literal: true

class UserMailer < ApplicationMailer
  default from: ENV.fetch('MAILER_FROM', 'noreply@skilledhub.example.com')

  def welcome_email(user)
    @user = user
    @email = user.email
    mail(to: @email, subject: 'Welcome to SkilledHub!')
  end

  def job_posted_email(job)
    @job = job
    @user = job.company_profile.user
    @company_name = job.company_profile.company_name || 'Your company'
    mail(to: @user.email, subject: "Job posted: #{job.title}")
  end

  def job_claimed_email(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician = accepted_app&.technician_profile
    @company_user = job.company_profile.user
    mail(to: @company_user.email, subject: "Your job \"#{job.title}\" was claimed")
  end

  def job_accepted_email(job)
    @job = job
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank?
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
    return if @recipient.blank?
    mail(to: @recipient.email, subject: "New message about #{@job.title}")
  end

  def payment_confirmation_email(job, amount_cents)
    @job = job
    @amount = amount_cents / 100.0
    @user = job.company_profile.user
    mail(to: @user.email, subject: "Payment confirmation: #{job.title} - $#{format('%.2f', @amount)}")
  end

  def payment_received_email(job, amount_cents)
    @job = job
    @amount = amount_cents / 100.0
    accepted_app = job.job_applications.find_by(status: :accepted)
    @technician_user = accepted_app&.technician_profile&.user
    return if @technician_user.blank?
    mail(to: @technician_user.email, subject: "You were paid $#{format('%.2f', @amount)} for #{job.title}")
  end

  def review_received_email(rating)
    @rating = rating
    @job = rating.job
    @reviewee_user = case rating.reviewee
                     when TechnicianProfile then rating.reviewee.user
                     when CompanyProfile then rating.reviewee.user
                     else nil
                     end
    return if @reviewee_user.blank?
    mail(to: @reviewee_user.email, subject: "You received a new review for #{@job.title}")
  end

  def review_reminder_email(job, user, role)
    @job = job
    @user = user
    @role = role # :technician or :company
    @other_party = role == :technician ? (job.company_profile.company_name || 'the company') : 'the technician'
    mail(to: user.email, subject: "Reminder: Leave a review for #{job.title}")
  end

  private

  def recipient_for_message(message)
    conv = message.conversation
    sender = message.sender
    if sender.is_a?(TechnicianProfile)
      conv.company_profile.user
    else
      conv.technician_profile.user
    end
  end
end
