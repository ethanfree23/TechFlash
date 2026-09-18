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
        attempts = filter_by_assessment(attempts)

        render json: {
          attempts: attempts.map { |attempt| AssessmentAttemptResultSerializer.new(attempt).as_json }
        }, status: :ok
      end

      # POST /api/v1/assessments/:assessment_id/attempts
      # Idempotent: returns the live attempt when one exists rather than
      # starting a second one or consuming an attempt allowance.
      def create
        assessment = Assessments::Lookup.active(params[:assessment_id])
        return render json: { error: "Assessment not found" }, status: :not_found if assessment.blank?

        result = Assessments::StartAttempt.call(
          technician_profile: @technician_profile,
          assessment: assessment
        )

        return render_start_failure(result) unless result.success?

        render json: AssessmentAttemptSerializer.new(result.attempt).as_json.merge(resumed: result.resumed?),
               status: :created
      end

      # GET /api/v1/assessment_attempts/:id
      # Returns the question paper while in progress, and the scored result once
      # finalized. The per-question review (explanations and the answer key) is
      # opt-in via ?include=review so the answer key is only ever sent when a
      # client is actually rendering a review screen.
      def show
        if @attempt.in_progress?
          return render json: AssessmentAttemptSerializer.new(@attempt).as_json, status: :ok
        end

        render json: result_payload(@attempt), status: :ok
      end

      # PATCH /api/v1/assessment_attempts/:id/answers
      # Incremental autosave so an attempt survives the app being backgrounded,
      # killed, or losing connectivity mid-sitting.
      def answers
        result = Assessments::SaveAnswers.call(attempt: @attempt, answers: params[:answers])

        return render_save_failure(result) unless result.success?

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

        result = Assessments::SubmitAttempt.call(attempt: @attempt.reload)

        unless result.success?
          return render json: { error: result.error_message, code: result.error_code },
                        status: :unprocessable_entity
        end

        render json: result_payload(result.attempt).merge(already_submitted: result.already_finalized?),
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

      def filter_by_assessment(attempts)
        slug_or_id = params[:assessment_slug].presence || params[:assessment_id].presence
        return attempts if slug_or_id.blank?

        assessment = Assessments::Lookup.find(slug_or_id)
        return attempts.none if assessment.blank?

        attempts.where(assessment_id: assessment.id)
      end

      def include_review?
        Array(params[:include]).flat_map { |value| value.to_s.split(",") }.map(&:strip).include?("review")
      end

      def result_payload(attempt)
        AssessmentAttemptResultSerializer.new(attempt, include_review: include_review?).as_json
      end

      # Eligibility failures (attempt limit, waiting period) are 422: the
      # request was understood but the technician is not allowed another sitting
      # yet. The response carries enough for the client to explain the wait.
      def render_start_failure(result)
        payload = { error: result.error_message, code: result.error_code }
        decision = result.decision
        if decision.present?
          payload[:attempts_used] = decision.attempts_used
          payload[:max_attempts] = decision.max_attempts
          payload[:available_at] = decision.available_at
        end

        render json: payload, status: :unprocessable_entity
      end

      # Writing to an attempt that is no longer live is a state conflict, not a
      # validation error, so clients can distinguish "you ran out of time" from
      # "your payload was wrong" and jump straight to the result screen.
      def render_save_failure(result)
        payload = { error: result.error_message, code: result.error_code }
        status =
          case result.error_code
          when "attempt_expired", "attempt_not_in_progress"
            payload[:attempt] = AssessmentAttemptResultSerializer.new(result.attempt.reload).as_json
            :conflict
          else
            :unprocessable_entity
          end

        render json: payload, status: status
      end
    end
  end
end
