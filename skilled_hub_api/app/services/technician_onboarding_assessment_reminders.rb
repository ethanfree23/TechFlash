# frozen_string_literal: true

# Conservative, deduplicated assessment reminders after onboarding completion.
# Uses AppNotification (same channel as Assessments::AssessmentEventNotifier).
class TechnicianOnboardingAssessmentReminders
  EVENT = "onboarding_assessment_reminder"

  def self.call
    new.call
  end

  def call
    days = TechnicianGuidedOnboarding.settings["assessment_reminder_days"]
    cutoff = days.days.ago

    scope = TechnicianOnboarding
      .where(status: "completed")
      .where.not(completed_at: nil)
      .where("completed_at <= ?", cutoff)
      .where(assessment_reminder_sent_at: nil)
      .includes(user: { technician_profile: :technician_assessment_results })

    sent = 0
    scope.find_each do |record|
      user = record.user
      next unless user&.technician?
      next unless incomplete_assessments?(user)

      # One reminder max; skip if a recent prompt already covers the same window.
      next if record.assessment_reminder_sent_at.present?
      next if recent_prompt?(record, days)

      AppNotification.create!(
        user_id: user.id,
        category: "assessment",
        title: "Reminder: Complete Your Skills Assessment",
        body: "Your TechFlash skills assessment is still waiting. Completing it helps demonstrate your qualifications for matching jobs.",
        metadata: {
          "event" => EVENT,
          "onboarding_completed_at" => record.completed_at&.iso8601
        }
      )
      record.update_columns(assessment_reminder_sent_at: Time.current, updated_at: Time.current)
      sent += 1
    rescue StandardError => e
      Rails.logger.warn("TechnicianOnboardingAssessmentReminders user=#{record.user_id}: #{e.class} #{e.message}")
    end

    { sent: sent }
  end

  private

  def incomplete_assessments?(user)
    progress = TechnicianOnboardingProgress.for(user)
    progress.dig(:assessments, :incomplete_count).to_i.positive?
  end

  def recent_prompt?(record, days)
    return false if record.assessment_prompt_sent_at.blank?

    record.assessment_prompt_sent_at > days.days.ago
  end
end
