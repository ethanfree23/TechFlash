# frozen_string_literal: true

module Api
  module V1
    # Technician-facing catalog: which knowledge assessments this technician can
    # take, where they stand on each, and whether they may start right now.
    #
    # Technician-only. Companies read assessment results through the technician
    # profile endpoints, never from here.
    class AssessmentsController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician
      before_action :load_technician_profile

      # GET /api/v1/assessments
      def index
        entries = Assessments::TechnicianCatalog.call(technician_profile: @technician_profile)

        render json: {
          assessments: entries.map { |entry| catalog_payload(entry) },
          disclaimer: Assessments::Disclaimer.for,
          profile_contribution: Assessments::ProfileContribution.call(
            technician_profile: @technician_profile
          ).as_json
        }, status: :ok
      end

      # GET /api/v1/assessments/:id
      # Accepts either the numeric id or the slug, so clients can deep-link to
      # "hvac_knowledge" without first resolving an id.
      def show
        assessment = find_assessment
        return render json: { error: "Assessment not found" }, status: :not_found if assessment.blank?

        entry = Assessments::TechnicianCatalog
                .new(technician_profile: @technician_profile)
                .entry_for(assessment)

        render json: catalog_payload(entry), status: :ok
      end

      private

      def load_technician_profile
        @technician_profile = @current_user.technician_profile
        return if @technician_profile.present?

        render json: { error: "Technician profile not found" }, status: :not_found
      end

      def find_assessment
        identifier = params[:id].to_s
        scope = Assessment.active
        return scope.find_by(id: identifier.to_i) if identifier.match?(/\A\d+\z/)

        scope.find_by(slug: identifier)
      end

      def catalog_payload(entry)
        assessment = AssessmentSerializer.new(entry.assessment).as_json
        decision = entry.retake_decision

        assessment.merge(
          recommended: entry.recommended?,
          state: entry.state,
          attempts_count: entry.attempts_count,
          can_start: decision.allowed?,
          start_blocked_reason: decision.allowed? ? nil : decision.reason,
          start_blocked_message: decision.allowed? ? nil : decision.message,
          attempts_used: decision.attempts_used,
          retake_available_at: decision.available_at,
          in_progress_attempt: in_progress_payload(entry.in_progress_attempt),
          result: result_payload(entry.public_result)
        )
      end

      def in_progress_payload(attempt)
        return nil if attempt.blank?

        {
          id: attempt.id,
          attempt_number: attempt.attempt_number,
          started_at: attempt.started_at,
          expires_at: attempt.expires_at,
          remaining_seconds: attempt.remaining_seconds,
          answered_questions: attempt.answered_questions,
          total_questions: attempt.total_questions,
          progress_percent: attempt.progress_percent
        }
      end

      def result_payload(result)
        return nil if result.blank?

        TechnicianAssessmentResultSerializer.new(result).as_json
      end
    end
  end
end
