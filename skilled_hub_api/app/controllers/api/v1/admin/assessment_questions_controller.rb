# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin CRUD for the question bank of a draft version, including answer
      # choices and which choice is correct.
      #
      # Choices can be supplied inline with a question (the usual authoring
      # flow) and are replaced wholesale when provided, which keeps the stored
      # answer key exactly equal to what the admin submitted.
      class AssessmentQuestionsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :load_version, only: %i[index create]
        before_action :load_question, only: %i[show update destroy]

        # GET /api/v1/admin/assessment_versions/:assessment_version_id/questions
        def index
          questions = @version.assessment_questions
                              .includes(:assessment_category, :assessment_answer_choices)
                              .ordered
          questions = questions.where(assessment_category_id: params[:assessment_category_id]) if params[:assessment_category_id].present?
          questions = questions.active if ActiveModel::Type::Boolean.new.cast(params[:active_only])

          render json: {
            questions: questions.map { |question| ::Admin::AssessmentQuestionSerializer.new(question).as_json },
            difficulties: AssessmentQuestion.difficulties.keys
          }, status: :ok
        end

        # GET /api/v1/admin/assessment_questions/:id
        def show
          render json: ::Admin::AssessmentQuestionSerializer.new(@question).as_json, status: :ok
        end

        # POST /api/v1/admin/assessment_versions/:assessment_version_id/questions
        def create
          return render(json: immutable_error(@version), status: :unprocessable_entity) unless @version.editable?

          category = @version.assessment_categories.find_by(id: params[:assessment_category_id]) ||
                     @version.assessment_categories.find_by(slug: params[:category_slug].to_s)
          return render json: { error: "Assessment category not found" }, status: :not_found if category.blank?

          question = @version.assessment_questions.new(question_params)
          question.assessment_category = category
          question.position = @version.assessment_questions.maximum(:position).to_i + 1 unless params.key?(:position)

          saved = false
          ActiveRecord::Base.transaction do
            saved = question.save
            raise ActiveRecord::Rollback unless saved

            saved = replace_choices!(question)
            raise ActiveRecord::Rollback unless saved
          end

          if saved
            render json: ::Admin::AssessmentQuestionSerializer.new(question.reload).as_json, status: :created
          else
            render json: { errors: question.errors.full_messages.presence || ["Question could not be saved"] },
                   status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/assessment_questions/:id
        def update
          version = @question.assessment_version
          return render(json: immutable_error(version), status: :unprocessable_entity) unless version.editable?

          if params[:assessment_category_id].present?
            category = version.assessment_categories.find_by(id: params[:assessment_category_id])
            return render json: { error: "Assessment category not found" }, status: :not_found if category.blank?

            @question.assessment_category = category
          end

          saved = false
          ActiveRecord::Base.transaction do
            saved = @question.update(question_params)
            raise ActiveRecord::Rollback unless saved

            saved = replace_choices!(@question)
            raise ActiveRecord::Rollback unless saved
          end

          if saved
            render json: ::Admin::AssessmentQuestionSerializer.new(@question.reload).as_json, status: :ok
          else
            render json: { errors: @question.errors.full_messages.presence || ["Question could not be saved"] },
                   status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/assessment_questions/:id
        def destroy
          version = @question.assessment_version
          return render(json: immutable_error(version), status: :unprocessable_entity) unless version.editable?

          if @question.destroy
            head :no_content
          else
            render json: { errors: @question.errors.full_messages }, status: :unprocessable_entity
          end
        end

        private

        def load_version
          @version = AssessmentVersion.find(params[:assessment_version_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment version not found" }, status: :not_found
        end

        def load_question
          @question = AssessmentQuestion.includes(:assessment_answer_choices).find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment question not found" }, status: :not_found
        end

        def submitted_choices
          permitted = params.permit(choices: %i[external_key body correct position])[:choices]
          Array(permitted).map { |choice| choice.to_h.stringify_keys }
        end

        # Returns false and annotates the question when the submitted choices
        # would leave it unscoreable, so a broken answer key never reaches the
        # bank in the first place.
        def replace_choices!(question)
          normalized = submitted_choices
          return true if normalized.blank?

          if normalized.size < 2
            question.errors.add(:base, "At least two answer choices are required")
            return false
          end

          correct_count = normalized.count { |choice| ActiveModel::Type::Boolean.new.cast(choice["correct"]) }
          unless correct_count == 1
            question.errors.add(:base, "Exactly one answer choice must be marked correct (found #{correct_count})")
            return false
          end

          if normalized.any? { |choice| choice["body"].to_s.strip.empty? }
            question.errors.add(:base, "Every answer choice needs body text")
            return false
          end

          question.assessment_answer_choices.destroy_all
          normalized.each_with_index do |choice, index|
            question.assessment_answer_choices.create!(
              external_key: choice["external_key"].presence || choice["key"].presence,
              body: choice["body"].to_s.strip,
              correct: ActiveModel::Type::Boolean.new.cast(choice["correct"]) == true,
              position: choice.key?("position") ? choice["position"].to_i : index
            )
          end

          true
        end

        def immutable_error(version)
          {
            error: "Version #{version.version_number} is #{version.status} and its content is immutable. " \
                   "Create a new version to change questions.",
            code: "version_immutable"
          }
        end

        def question_params
          params.permit(
            :external_key, :prompt, :explanation, :difficulty, :active, :position,
            :media_url, :media_type, :media_alt_text, metadata: {}
          )
        end
      end
    end
  end
end
