# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin management of assessment versions and their lifecycle.
      #
      # The immutability contract is enforced in two places and this controller
      # relies on both: AssessmentVersion rejects config changes after publish,
      # and AssessmentContentImmutability rejects content changes. Rather than
      # letting an admin hit those errors, `update` refuses early with a pointer
      # to the clone action.
      class AssessmentVersionsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :load_assessment, only: %i[index create]
        before_action :load_version, only: %i[show update destroy publish retire clone]

        # GET /api/v1/admin/assessments/:assessment_id/versions
        def index
          versions = @assessment.assessment_versions
                                .includes(:assessment_categories)
                                .order(version_number: :desc)

          render json: {
            versions: versions.map { |version| ::Admin::AssessmentVersionSerializer.new(version).as_json }
          }, status: :ok
        end

        # GET /api/v1/admin/assessment_versions/:id
        def show
          render json: version_payload(@version), status: :ok
        end

        # POST /api/v1/admin/assessments/:assessment_id/versions
        # With source_version_id, deep-copies that version's content into the
        # new draft. This is the supported way to revise published content.
        def create
          if params[:source_version_id].present?
            source = @assessment.assessment_versions.find_by(id: params[:source_version_id])
            return render json: { error: "Source version not found" }, status: :not_found if source.blank?

            result = Assessments::VersionPublisher.clone_to_draft(source, attributes: version_params)
            return render json: version_payload(result.version), status: :created
          end

          version = @assessment.assessment_versions.new(version_params)
          version.version_number ||= @assessment.next_version_number
          version.status = :draft
          version.score_bands = Assessments::ScoreBands.starter_template if version.score_bands.blank?

          if version.save
            render json: version_payload(version), status: :created
          else
            render json: { errors: version.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/assessment_versions/:id
        def update
          unless @version.editable?
            return render json: {
              error: "Version #{@version.version_number} is #{@version.status} and is immutable. " \
                     "Create a new version from it to make changes.",
              reason: "version_immutable"
            }, status: :unprocessable_entity
          end

          if @version.update(version_params)
            render json: version_payload(@version.reload), status: :ok
          else
            render json: { errors: @version.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # POST /api/v1/admin/assessment_versions/:id/publish
        # Freezes content and makes this the version technicians are served.
        def publish
          result = Assessments::VersionPublisher.publish!(@version)

          unless result.success?
            return render json: {
              error: result.error_message,
              reason: result.error_code,
              problems: result.problems
            }, status: :unprocessable_entity
          end

          render json: version_payload(result.version), status: :ok
        end

        # POST /api/v1/admin/assessment_versions/:id/retire
        # Stops new attempts against this version. Existing attempts and results
        # are untouched.
        def retire
          result = Assessments::VersionPublisher.retire!(@version)

          unless result.success?
            return render json: { error: result.error_message, reason: result.error_code },
                          status: :unprocessable_entity
          end

          render json: version_payload(result.version), status: :ok
        end

        # POST /api/v1/admin/assessment_versions/:id/clone
        def clone
          result = Assessments::VersionPublisher.clone_to_draft(@version, attributes: version_params)
          render json: version_payload(result.version), status: :created
        end

        # DELETE /api/v1/admin/assessment_versions/:id
        def destroy
          if @version.attempts_recorded?
            return render json: {
              error: "This version has recorded attempts and cannot be deleted. Retire it instead."
            }, status: :unprocessable_entity
          end

          AssessmentContentImmutability.bypass { @version.destroy! }
          head :no_content
        end

        private

        def load_assessment
          @assessment = Assessment.find(params[:assessment_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment not found" }, status: :not_found
        end

        def load_version
          @version = AssessmentVersion.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment version not found" }, status: :not_found
        end

        def version_payload(version)
          ::Admin::AssessmentVersionSerializer.new(version).as_json.merge(
            assessment: ::Admin::AssessmentSerializer.new(version.assessment).as_json
          )
        end

        def version_params
          permitted = params.permit(
            :version_number, :instructions, :question_count, :time_limit_minutes, :passing_score,
            :max_attempts, :retake_wait_hours, :randomize_questions, :randomize_answer_choices,
            :allow_resume, :allow_back_navigation, :scoring_strategy,
            score_bands: %i[slug label min_score max_score],
            metadata: {}
          )
          permitted[:score_bands] = permitted[:score_bands].map(&:to_h) if permitted[:score_bands].present?
          permitted
        end
      end
    end
  end
end
