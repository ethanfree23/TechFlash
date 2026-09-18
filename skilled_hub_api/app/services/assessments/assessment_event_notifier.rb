# frozen_string_literal: true

module Assessments
  # In-app notifications for assessment events, following the same shape as
  # VerificationEventNotifier: create an AppNotification, swallow failures so a
  # notification problem can never break the flow that triggered it.
  #
  # Deliberately limited to the two events that matter at launch — an attempt
  # finishing, and a retake becoming available. No email or SMS channel is added
  # here; assessment results are not time-critical and the in-app inbox is
  # where technicians already look for profile events.
  class AssessmentEventNotifier
    CATEGORY = "assessment"

    class << self
      def attempt_finalized(attempt)
        return if attempt.blank?

        if attempt.expired?
          attempt_expired(attempt)
        else
          attempt_completed(attempt)
        end
      end

      def attempt_completed(attempt)
        level = attempt.score_band_label.presence
        body = [
          "You scored #{attempt.score}/100 on the #{attempt.assessment.title}.",
          level && "Level: #{level}.",
          "Your best score is now shown on your TechFlash profile."
        ].compact.join(" ")

        create_app_notification(
          user_id: attempt.user_id,
          title: "#{attempt.assessment.title} completed",
          body: body,
          metadata: base_metadata(attempt).merge("event" => "attempt_completed")
        )
      end

      def attempt_expired(attempt)
        create_app_notification(
          user_id: attempt.user_id,
          title: "#{attempt.assessment.title} attempt expired",
          body: "Your attempt ran out of time and was scored on the answers you submitted " \
                "(#{attempt.score}/100). You can review your results on your profile.",
          metadata: base_metadata(attempt).merge("event" => "attempt_expired")
        )
      end

      # Called by the retake sweeper once a configured waiting period elapses.
      def retake_available(technician_profile:, assessment:)
        create_app_notification(
          user_id: technician_profile.user_id,
          title: "#{assessment.title} retake available",
          body: "You can retake the #{assessment.title} now. Your profile always shows your best score.",
          metadata: {
            "event" => "retake_available",
            "assessment_id" => assessment.id,
            "assessment_slug" => assessment.slug
          }
        )
      end

      private

      def base_metadata(attempt)
        {
          "assessment_id" => attempt.assessment_id,
          "assessment_slug" => attempt.assessment.slug,
          "assessment_attempt_id" => attempt.id,
          "assessment_version_id" => attempt.assessment_version_id,
          "version_number" => attempt.assessment_version.version_number,
          "attempt_number" => attempt.attempt_number,
          "score" => attempt.score,
          "score_band_slug" => attempt.score_band_slug,
          "score_band_label" => attempt.score_band_label
        }
      end

      def create_app_notification(user_id:, title:, body:, metadata:)
        AppNotification.create!(
          user_id: user_id,
          category: CATEGORY,
          title: title,
          body: body,
          metadata: metadata
        )
      rescue StandardError => e
        Rails.logger.warn("Assessments::AssessmentEventNotifier: #{e.class} #{e.message}")
      end
    end
  end
end
