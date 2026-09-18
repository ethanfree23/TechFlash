# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin CRUD for assessments themselves (identity, trade, activation,
      # which result rule companies see). Question content lives on versions.
      class AssessmentsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :load_assessment, only: %i[show update destroy]

        # GET /api/v1/admin/assessments
        def index
          assessments = Assessment.includes(assessment_versions: :assessment_categories).order(:position, :id)

          render json: {
            assessments: assessments.map { |assessment| ::Admin::AssessmentSerializer.new(assessment).as_json },
            trade_options: TradeCatalog::OPTIONS,
            public_result_rules: Assessment::PUBLIC_RESULT_RULES,
            scoring_strategies: AssessmentVersion::SCORING_STRATEGIES,
            score_band_template: Assessments::ScoreBands.starter_template,
            default_disclaimer: Assessments::Disclaimer::DEFAULT
          }, status: :ok
        end

        # GET /api/v1/admin/assessments/:id
        def show
          render json: ::Admin::AssessmentSerializer.new(@assessment, include_versions: true).as_json, status: :ok
        end

        # POST /api/v1/admin/assessments
        # Creates the assessment together with an empty draft version 1, so an
        # author always has somewhere to put categories and questions.
        def create
          assessment = Assessment.new(assessment_params)
          assessment.assessment_versions.new(
            version_number: 1,
            status: :draft,
            score_bands: Assessments::ScoreBands.starter_template
          )

          if assessment.save
            render json: ::Admin::AssessmentSerializer.new(assessment, include_versions: true).as_json,
                   status: :created
          else
            render json: { errors: assessment.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/assessments/:id
        def update
          rule_changed = assessment_params.key?(:public_result_rule) &&
                         assessment_params[:public_result_rule].to_s != @assessment.public_result_rule

          if @assessment.update(assessment_params)
            # Changing which attempt companies see must take effect for existing
            # technicians too, not only for future attempts.
            Assessments::PublicResultProjector.recompute_assessment(@assessment) if rule_changed

            render json: ::Admin::AssessmentSerializer.new(@assessment.reload, include_versions: true).as_json,
                   status: :ok
          else
            render json: { errors: @assessment.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/assessments/:id
        # Refused once attempts exist; deactivate instead so historical results
        # stay intact.
        def destroy
          if @assessment.assessment_attempts.exists?
            return render json: {
              error: "This assessment has recorded attempts and cannot be deleted. Deactivate it instead.",
              code: "assessment_has_attempts"
            }, status: :unprocessable_entity
          end

          AssessmentContentImmutability.bypass { @assessment.destroy! }
          head :no_content
        end

        private

        def load_assessment
          @assessment = Assessment.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment not found" }, status: :not_found
        end

        def assessment_params
          params.permit(
            :slug, :title, :description, :company_disclaimer, :trade_type,
            :active, :public_result_rule, :position, metadata: {}
          )
        end
      end
    end
  end
end
