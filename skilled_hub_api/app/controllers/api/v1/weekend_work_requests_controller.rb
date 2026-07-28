# frozen_string_literal: true

module Api
  module V1
    class WeekendWorkRequestsController < ApplicationController
      before_action :authenticate_user
      before_action :set_job

      def index
        requests = @job.weekend_work_requests.order(created_at: :desc)
        render json: requests, status: :ok
      end

      def create
        return render_forbidden unless can_manage_job?(@job)

        accepted_app = @job.job_applications.find_by(status: :accepted)
        unless accepted_app
          return render json: { error: "A technician must claim the job before weekend work can be requested." }, status: :unprocessable_entity
        end

        request = @job.weekend_work_requests.new(request_params)
        request.technician_profile = accepted_app.technician_profile
        request.requested_by_user = @current_user
        request.status = :requested_by_company

        if request.save
          render json: request, status: :created
        else
          render json: { errors: request.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        request = @job.weekend_work_requests.find(params[:id])
        status = params[:status].to_s

        if %w[accepted_by_technician declined_by_technician].include?(status)
          unless @current_user.technician? && request.technician_profile.user_id == @current_user.id
            return render_forbidden
          end
          request.assign_attributes(status: status, technician_response_note: params[:technician_response_note], responded_at: Time.current)
        elsif status == "cancelled"
          return render_forbidden unless can_manage_job?(@job)
          request.assign_attributes(status: :cancelled, cancelled_at: Time.current)
        elsif status == "completed"
          return render_forbidden unless can_manage_job?(@job)
          request.assign_attributes(status: :completed, completed_at: Time.current)
        else
          return render json: { error: "Unsupported status transition." }, status: :unprocessable_entity
        end

        if request.save
          render json: request, status: :ok
        else
          render json: { errors: request.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Weekend request not found" }, status: :not_found
      end

      private

      def set_job
        @job = Job.find(params[:job_id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def request_params
        params.permit(:requested_date, :requested_start_at, :requested_end_at, :estimated_hours, :applicable_multiplier, :company_note)
      end

      def can_manage_job?(job)
        @current_user&.admin? || (@current_user&.company? && job.company_profile_id == @current_user.company_profile&.id)
      end

      def render_forbidden
        render json: { error: "Access denied" }, status: :forbidden
      end
    end
  end
end
