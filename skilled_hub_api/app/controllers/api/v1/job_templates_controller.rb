module Api
  module V1
    class JobTemplatesController < ApplicationController
      before_action :authenticate_user
      before_action :require_company_or_admin
      before_action :load_template, only: [:show, :update, :destroy, :apply]

      def index
        render json: scoped_templates.recently_updated,
               each_serializer: JobTemplateSerializer,
               status: :ok
      end

      def show
        render json: @template, serializer: JobTemplateSerializer, status: :ok
      end

      # Accepts either `from_job_id` (save a completed job configuration as a template) or
      # a `configuration` payload straight from the create-job form.
      def create
        company_profile = resolve_company_profile
        return if performed?

        configuration =
          if params[:from_job_id].present?
            job = Job.find_by(id: params[:from_job_id], company_profile_id: company_profile.id)
            return render json: { error: "Job not found" }, status: :not_found if job.blank?

            JobTemplates::Builder.from_job(job)
          else
            JobTemplates::Builder.from_attributes(configuration_params)
          end

        template = JobTemplate.new(
          company_profile_id: company_profile.id,
          created_by_user_id: @current_user.id,
          name: params[:name],
          configuration: configuration
        )
        if template.save
          render json: template, serializer: JobTemplateSerializer, status: :created
        else
          render json: { errors: template.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # Rename and/or replace the stored configuration.
      def update
        @template.name = params[:name] if params.key?(:name)
        if params.key?(:configuration)
          @template.configuration = JobTemplates::Builder.from_attributes(configuration_params)
        elsif params[:from_job_id].present?
          job = Job.find_by(id: params[:from_job_id], company_profile_id: @template.company_profile_id)
          return render json: { error: "Job not found" }, status: :not_found if job.blank?

          @template.configuration = JobTemplates::Builder.from_job(job)
        end

        if @template.save
          render json: @template, serializer: JobTemplateSerializer, status: :ok
        else
          render json: { errors: @template.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @template.destroy
        head :no_content
      end

      # Returns the job attributes this template produces for a chosen start date, so the
      # company can review and edit before publishing.
      def apply
        result = JobTemplates::Applier.call(template: @template, start_date: params[:start_date])
        @template.record_use!
        render json: {
          template: JobTemplateSerializer.new(@template, scope: @current_user).as_json,
          job_attributes: result.attributes,
          scheduled_start_at: result.start_at,
          scheduled_end_at: result.end_at,
          working_dates: result.working_dates
        }, status: :ok
      end

      private

      def require_company_or_admin
        return if @current_user&.company? || @current_user&.admin?

        render json: { error: "Access denied. Company or admin role required." }, status: :forbidden
      end

      def scoped_templates
        return JobTemplate.all if @current_user.admin? && params[:company_profile_id].blank?
        return JobTemplate.where(company_profile_id: params[:company_profile_id]) if @current_user.admin?

        JobTemplate.where(company_profile_id: @current_user.company_profile&.id)
      end

      def load_template
        @template = JobTemplate.find(params[:id])
        return if can_manage?(@template)

        render json: { error: "Access denied" }, status: :forbidden
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Template not found" }, status: :not_found
      end

      def can_manage?(template)
        return true if @current_user.admin?

        @current_user.company? && template.company_profile_id == @current_user.company_profile&.id
      end

      def resolve_company_profile
        if @current_user.company?
          profile = @current_user.company_profile
          if profile.blank?
            render json: { error: "Company profile not found for current user" }, status: :unprocessable_entity
            return nil
          end
          return profile
        end

        profile = CompanyProfile.find_by(id: params[:company_profile_id])
        if profile.blank?
          render json: { error: "Valid company_profile_id is required for admin template creation" }, status: :unprocessable_entity
          return nil
        end
        profile
      end

      def configuration_params
        raw = params[:configuration]
        return {} if raw.blank?

        permitted = raw.permit(
          *(JobTemplate::REUSABLE_FIELDS - %w[standard_work_days standard_day_shifts weekend_day_shifts potential_full_time_details]),
          *JobTemplate::SCHEDULE_META_KEYS,
          standard_work_days: [],
          standard_day_shifts: {},
          weekend_day_shifts: {},
          potential_full_time_details: {}
        )
        permitted.to_h
      end
    end
  end
end
