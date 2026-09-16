# frozen_string_literal: true

module Api
  module V1
    # The technician's own assessment attempts: start/resume, autosave answers,
    # submit, and review history.
    #
    # Every action is scoped to @current_user.technician_profile, so a technician
    # can only ever reach their own attempts — another technician's attempt is a
    # 404, not a 403, so attempt ids are not enumerable.
    class AssessmentAttemptsController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician
      before_action :load_technician_profile
      before_action :load_attempt, only: %i[show answers submit]

      # GET /api/v1/assessment_attempts
      # The technician's full history ("Attempt 1 - 61 - Aug 10").
      def index
        Assessments::AttemptExpirer.sweep_for(technician_profile: @technician_profile)

        attempts = own_attempts
                   .includes(:assessment, :assessment_version, :assessment_attempt_category_results)
                   .recent_first
        attempts = attempts.where(assessment_id: params[:assessment_id]) if params[:assessment_id].present?

        render json: {
          attempts: attempts.map { |attempt| AssessmentAttemptResultSerializer.new(attempt).as_json }
        }, status: :ok
      end

      # POST /api/v1/assessments/:assessment_id/attempts
      # Idempotent: returns the live attempt when one exists rather than
      # starting a second one or consuming an attempt allowance.
      def create
        assessment = Assessment.active.find_by(id: params[:assessment_id])
        return render json: { error: "Assessment not found" }, status: :not_found if assessment.blank?

        result = Assessments::StartAttempt.call(
          technician_profile: @technician_profile,
          assessment: assessment
        )

        unless result.success?
          return render json: {
            error: result.error_message,
            reason: result.error_code
          }, status: :unprocessable_entity
        end

        render json: AssessmentAttemptSerializer.new(result.attempt).as_json.merge(resumed: result.resumed?),
               status: result.resumed? ? :ok : :created
      end

      # GET /api/v1/assessment_attempts/:id
      # Returns the question paper while in progress, and the scored result
      # (including a per-question review) once finalized.
      def show
        if @attempt.in_progress?
          return render json: AssessmentAttemptSerializer.new(@attempt).as_json, status: :ok
        end

        render json: AssessmentAttemptResultSerializer.new(@attempt, include_review: true).as_json, status: :ok
      end

      # PATCH /api/v1/assessment_attempts/:id/answers
      # Incremental autosave so an attempt survives the app being backgrounded,
      # killed, or losing connectivity mid-sitting.
      def answers
        result = Assessments::SaveAnswers.call(attempt: @attempt, answers: params[:answers])

        unless result.success?
          return render json: {
            error: result.error_message,
            reason: result.error_code,
            attempt: AssessmentAttemptResultSerializer.new(result.attempt.reload).as_json
          }, status: :unprocessable_entity
        end

        attempt = result.attempt
        render json: {
          id: attempt.id,
          status: attempt.status,
          saved_count: result.saved_count,
          answered_questions: attempt.answered_questions,
          total_questions: attempt.total_questions,
          progress_percent: attempt.progress_percent,
          remaining_seconds: attempt.remaining_seconds
        }, status: :ok
      end

      # POST /api/v1/assessment_attempts/:id/submit
      # Scoring is server-side and duplicate-safe: a repeated submit returns the
      # already-scored attempt untouched.
      def submit
        Assessments::SaveAnswers.call(attempt: @attempt, answers: params[:answers]) if params[:answers].present?

        if @attempt.reload.completed? || @attempt.expired?
          return render json: AssessmentAttemptResultSerializer.new(@attempt, include_review: true)
                                                               .as_json
                                                               .merge(already_submitted: true),
                        status: :ok
        end

        result = Assessments::SubmitAttempt.call(attempt: @attempt)

        unless result.success?
          return render json: { error: result.error_message, reason: result.error_code },
                        status: :unprocessable_entity
        end

        render json: AssessmentAttemptResultSerializer.new(result.attempt, include_review: true)
                                                     .as_json
                                                     .merge(already_submitted: result.already_finalized?),
               status: :ok
      end

      private

      def load_technician_profile
        @technician_profile = @current_user.technician_profile
        return if @technician_profile.present?

        render json: { error: "Technician profile not found" }, status: :not_found
      end

      def own_attempts
        AssessmentAttempt.where(technician_profile_id: @technician_profile.id)
      end

      def load_attempt
        @attempt = own_attempts.find_by(id: params[:id])
        return render json: { error: "Assessment attempt not found" }, status: :not_found if @attempt.blank?

        # Apply wall-clock expiry before acting on the attempt, so a client that
        # returns after the time limit gets a clean expired result instead of
        # being allowed to keep answering.
        @attempt = Assessments::AttemptExpirer.expire!(@attempt)
      end
    end
  end
end
