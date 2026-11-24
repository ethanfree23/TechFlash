# frozen_string_literal: true

# Idempotent completion of guided technician onboarding.
# Validates technician-action requirements server-side and triggers a one-time
# assessment prompt notification when applicable.
class TechnicianOnboardingCompleter
  Result = Struct.new(:ok, :onboarding, :error, :already_complete, keyword_init: true)

  def self.call(user:)
    new(user: user).call
  end

  def initialize(user:)
    @user = user
  end

  def call
    return Result.new(ok: false, error: "Technician account required") unless @user&.technician?

    record = TechnicianOnboarding.ensure_for!(@user)
    progress = TechnicianOnboardingProgress.for(@user)

    if record.completed? && record.required_by_admin_at.blank?
      return Result.new(ok: true, onboarding: progress, already_complete: true)
    end

    unless progress[:can_complete]
      incomplete = progress[:sections].select { |_, v| !v[:technician_complete] }.keys
      return Result.new(
        ok: false,
        error: "Onboarding incomplete",
        onboarding: progress.merge(incomplete_sections: incomplete)
      )
    end

    ActiveRecord::Base.transaction do
      record.lock!
      # Re-check inside lock for idempotency across tabs/retries.
      if record.completed? && record.required_by_admin_at.blank?
        return Result.new(ok: true, onboarding: TechnicianOnboardingProgress.for(@user), already_complete: true)
      end

      record.mark_completed!
      send_assessment_prompt_once!(record)
    end

    Result.new(ok: true, onboarding: TechnicianOnboardingProgress.for(@user.reload), already_complete: false)
  end

  private

  def send_assessment_prompt_once!(record)
    return if record.assessment_prompt_sent_at.present?

    progress = TechnicianOnboardingProgress.for(@user)
    assessments = progress[:assessments] || {}
    return if assessments[:incomplete_count].to_i <= 0

    AppNotification.create!(
      user_id: @user.id,
      category: "assessment",
      title: "Complete Your Skills Assessment",
      body: "Finish your TechFlash skills assessment to demonstrate your qualifications and improve access to matching job opportunities.",
      metadata: {
        "event" => "onboarding_assessment_prompt",
        "incomplete_slugs" => Array(assessments[:incomplete_slugs]),
        "onboarding_completed_at" => Time.current.iso8601
      }
    )
    record.update_columns(assessment_prompt_sent_at: Time.current, updated_at: Time.current)
  rescue StandardError => e
    Rails.logger.warn("TechnicianOnboardingCompleter assessment prompt: #{e.class} #{e.message}")
  end
end
