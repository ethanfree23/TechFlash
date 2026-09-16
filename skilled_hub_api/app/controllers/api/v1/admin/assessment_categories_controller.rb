# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin CRUD for a draft version's blueprint categories.
      #
      # `question_count` here is the blueprint: how many questions this category
      # contributes to every attempt. The serializer reports bank health so an
      # author can see when a category's blueprint exceeds its usable bank
      # before trying to publish.
      class AssessmentCategoriesController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :load_version, only: %i[index create]
        before_action :load_category, only: %i[update destroy]

        # GET /api/v1/admin/assessment_versions/:assessment_version_id/categories
        def index
          categories = @version.assessment_categories.ordered.includes(assessment_questions: :assessment_answer_choices)

          render json: {
            categories: categories.map { |category| ::Admin::AssessmentCategorySerializer.new(category).as_json }
          }, status: :ok
        end

        # POST /api/v1/admin/assessment_versions/:assessment_version_id/categories
        def create
          return render(json: immutable_error(@version), status: :unprocessable_entity) unless @version.editable?

          category = @version.assessment_categories.new(category_params)
          category.position = @version.assessment_categories.maximum(:position).to_i + 1 unless params.key?(:position)

          if category.save
            render json: ::Admin::AssessmentCategorySerializer.new(category).as_json, status: :created
          else
            render json: { errors: category.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/assessment_categories/:id
        def update
          version = @category.assessment_version
          return render(json: immutable_error(version), status: :unprocessable_entity) unless version.editable?

          if @category.update(category_params)
            render json: ::Admin::AssessmentCategorySerializer.new(@category.reload).as_json, status: :ok
          else
            render json: { errors: @category.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/assessment_categories/:id
        def destroy
          version = @category.assessment_version
          return render(json: immutable_error(version), status: :unprocessable_entity) unless version.editable?

          if @category.destroy
            head :no_content
          else
            render json: { errors: @category.errors.full_messages }, status: :unprocessable_entity
          end
        end

        private

        def load_version
          @version = AssessmentVersion.find(params[:assessment_version_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment version not found" }, status: :not_found
        end

        def load_category
          @category = AssessmentCategory.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Assessment category not found" }, status: :not_found
        end

        def immutable_error(version)
          {
            error: "Version #{version.version_number} is #{version.status} and its content is immutable. " \
                   "Create a new version to change categories.",
            code: "version_immutable"
          }
        end

        def category_params
          params.permit(:slug, :name, :description, :question_count, :weight, :position)
        end
      end
    end
  end
end
