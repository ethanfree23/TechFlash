# frozen_string_literal: true

module Assessments
  # The assessment slice of a technician's profile readiness.
  #
  # Deliberately additive and non-gating. It does NOT feed
  # MembershipPolicy.technician_profile_completeness_percent, which is a job
  # access gate — adding a new required field there would instantly drop every
  # existing technician's completeness and could make them ineligible for jobs
  # they qualify for today. Taking an assessment can only ever raise a
  # technician's profile strength here, never lower it.
  #
  # If a future product decision makes a minimum score a job requirement, that
  # belongs in MembershipPolicy / job matching as an explicit opt-in, not here.
  class ProfileContribution
    # Share of the informational profile-strength score attributable to having
    # completed a trade knowledge assessment.
    STRENGTH_WEIGHT_PERCENT = 15

    Summary = Struct.new(
      :state,
      :label,
      :assessment_id,
      :assessment_slug,
      :assessment_title,
      :score,
      :score_band_label,
      :completed_at,
      :recommended_assessment_id,
      :recommended_assessment_slug,
      :recommended_assessment_title,
      :earned_strength_percent,
      :available_strength_percent,
      keyword_init: true
    ) do
      def completed?
        state == TechnicianCatalog::STATE_COMPLETED
      end

      def as_json(*)
        {
          "state" => state,
          "label" => label,
          "assessment_id" => assessment_id,
          "assessment_slug" => assessment_slug,
          "assessment_title" => assessment_title,
          "score" => score,
          "score_band_label" => score_band_label,
          "completed_at" => completed_at&.iso8601,
          "recommended_assessment_id" => recommended_assessment_id,
          "recommended_assessment_slug" => recommended_assessment_slug,
          "recommended_assessment_title" => recommended_assessment_title,
          "earned_strength_percent" => earned_strength_percent,
          "available_strength_percent" => available_strength_percent,
          "counts_toward_job_access" => false
        }
      end
    end

    def self.call(technician_profile:)
      new(technician_profile: technician_profile).call
    end

    attr_reader :technician_profile

    def initialize(technician_profile:)
      @technician_profile = technician_profile
    end

    def call
      entries = TechnicianCatalog.call(technician_profile: technician_profile)
      return empty_summary if entries.empty?

      recommended = entries.find(&:recommended?) || entries.first
      best = best_completed_entry(entries)
      in_progress = entries.find { |entry| entry.state == TechnicianCatalog::STATE_IN_PROGRESS }

      if best.present?
        completed_summary(best, recommended)
      elsif in_progress.present?
        in_progress_summary(in_progress, recommended)
      else
        not_started_summary(recommended)
      end
    end

    private

    def best_completed_entry(entries)
      entries
        .select { |entry| entry.public_result.present? }
        .max_by { |entry| [entry.recommended? ? 1 : 0, entry.public_result.score] }
    end

    def completed_summary(entry, recommended)
      result = entry.public_result
      Summary.new(
        state: TechnicianCatalog::STATE_COMPLETED,
        label: "Assessment completed",
        assessment_id: entry.assessment.id,
        assessment_slug: entry.assessment.slug,
        assessment_title: entry.assessment.title,
        score: result.score,
        score_band_label: result.score_band_label,
        completed_at: result.completed_at,
        recommended_assessment_id: recommended&.assessment&.id,
        recommended_assessment_slug: recommended&.assessment&.slug,
        recommended_assessment_title: recommended&.assessment&.title,
        earned_strength_percent: STRENGTH_WEIGHT_PERCENT,
        available_strength_percent: STRENGTH_WEIGHT_PERCENT
      )
    end

    def in_progress_summary(entry, recommended)
      Summary.new(
        state: TechnicianCatalog::STATE_IN_PROGRESS,
        label: "Assessment in progress",
        assessment_id: entry.assessment.id,
        assessment_slug: entry.assessment.slug,
        assessment_title: entry.assessment.title,
        score: nil,
        score_band_label: nil,
        completed_at: nil,
        recommended_assessment_id: recommended&.assessment&.id,
        recommended_assessment_slug: recommended&.assessment&.slug,
        recommended_assessment_title: recommended&.assessment&.title,
        earned_strength_percent: 0,
        available_strength_percent: STRENGTH_WEIGHT_PERCENT
      )
    end

    def not_started_summary(recommended)
      Summary.new(
        state: TechnicianCatalog::STATE_NOT_STARTED,
        label: "Assessment not taken",
        assessment_id: nil,
        assessment_slug: nil,
        assessment_title: nil,
        score: nil,
        score_band_label: nil,
        completed_at: nil,
        recommended_assessment_id: recommended&.assessment&.id,
        recommended_assessment_slug: recommended&.assessment&.slug,
        recommended_assessment_title: recommended&.assessment&.title,
        earned_strength_percent: 0,
        available_strength_percent: STRENGTH_WEIGHT_PERCENT
      )
    end

    # No assessment exists for this platform yet (the state before the HVAC /
    # Plumbing / Electrical banks ship). Nothing is offered and no strength is
    # withheld, so existing technicians are unaffected.
    def empty_summary
      Summary.new(
        state: TechnicianCatalog::STATE_NOT_STARTED,
        label: "No assessment available",
        assessment_id: nil,
        assessment_slug: nil,
        assessment_title: nil,
        score: nil,
        score_band_label: nil,
        completed_at: nil,
        recommended_assessment_id: nil,
        recommended_assessment_slug: nil,
        recommended_assessment_title: nil,
        earned_strength_percent: 0,
        available_strength_percent: 0
      )
    end
  end
end
