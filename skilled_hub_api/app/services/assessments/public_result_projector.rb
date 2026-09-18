# frozen_string_literal: true

module Assessments
  # Rebuilds the single result a technician shows companies for one assessment.
  #
  # Companies see a designated result, never the attempt history, so a low first
  # attempt is not held against a technician who improved. Which attempt is
  # designated is governed by Assessment#public_result_rule:
  #
  #   best_valid   - highest score; ties broken by the more recent completion
  #   latest_valid - most recently completed scored attempt
  #
  # Launch configuration is best_valid. Switching an assessment to latest_valid
  # is a field update plus a recompute of that assessment's projections.
  class PublicResultProjector
    def self.call(technician_profile:, assessment:)
      new(technician_profile: technician_profile, assessment: assessment).call
    end

    # Recomputes every technician's projection for an assessment. Use after
    # changing an assessment's public_result_rule.
    def self.recompute_assessment(assessment)
      AssessmentAttempt
        .where(assessment_id: assessment.id)
        .distinct
        .pluck(:technician_profile_id)
        .each do |technician_profile_id|
          profile = TechnicianProfile.find_by(id: technician_profile_id)
          next if profile.blank?

          call(technician_profile: profile, assessment: assessment)
        end
    end

    attr_reader :technician_profile, :assessment

    def initialize(technician_profile:, assessment:)
      @technician_profile = technician_profile
      @assessment = assessment
    end

    def call
      attempts = scored_attempts
      if attempts.empty?
        TechnicianAssessmentResult
          .where(technician_profile_id: technician_profile.id, assessment_id: assessment.id)
          .destroy_all
        return nil
      end

      designated = designate(attempts)
      latest = attempts.max_by { |attempt| [attempt.completed_at, attempt.id] }
      best = attempts.max_by { |attempt| [attempt.score, attempt.completed_at, attempt.id] }

      result = TechnicianAssessmentResult.find_or_initialize_by(
        technician_profile_id: technician_profile.id,
        assessment_id: assessment.id
      )

      result.assign_attributes(
        assessment_attempt_id: designated.id,
        assessment_version_id: designated.assessment_version_id,
        selection_rule: rule,
        score: designated.score,
        score_band_slug: designated.score_band_slug,
        score_band_label: designated.score_band_label,
        passed: designated.passed,
        completed_at: designated.completed_at,
        attempts_count: attempts.size,
        best_score: best.score,
        latest_score: latest.score,
        latest_completed_at: latest.completed_at,
        category_scores: category_scores_for(designated)
      )
      result.save!
      result
    end

    private

    def rule
      value = assessment.public_result_rule.to_s
      Assessment::PUBLIC_RESULT_RULES.include?(value) ? value : "best_valid"
    end

    def scored_attempts
      AssessmentAttempt
        .where(technician_profile_id: technician_profile.id, assessment_id: assessment.id)
        .scored
        .where.not(completed_at: nil)
        .to_a
    end

    def designate(attempts)
      case rule
      when "latest_valid"
        attempts.max_by { |attempt| [attempt.completed_at, attempt.id] }
      else
        attempts.max_by { |attempt| [attempt.score, attempt.completed_at, attempt.id] }
      end
    end

    def category_scores_for(attempt)
      attempt.assessment_attempt_category_results.ordered.map(&:as_public_json)
    end
  end
end
