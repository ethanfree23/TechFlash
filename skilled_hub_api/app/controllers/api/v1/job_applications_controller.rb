module Api
  module V1
    class JobApplicationsController < ApplicationController
      before_action :authenticate_user
      before_action :require_job_seeker, only: [:create, :index]
      
      def index
        job_applications = JobApplication.all
        
        # Scope based on user role
        if @current_user.technician?
          # Job seekers only see their own applications
          technician_profile = @current_user.technician_profile
          if technician_profile
            job_applications = job_applications.where(technician_profile: technician_profile)
          else
            job_applications = JobApplication.none # No applications if no profile
          end
        elsif @current_user.company?
          # Companies can optionally filter by their jobs
          if params[:job_id].present?
            # Verify the job belongs to the company
            company_job = Job.joins(:company_profile)
                            .where(company_profiles: { id: @current_user.company_profile&.id })
                            .find(params[:job_id])
            job_applications = job_applications.where(job: company_job)
          else
            # Show all applications for company's jobs
            company_jobs = Job.joins(:company_profile)
                             .where(company_profiles: { id: @current_user.company_profile&.id })
            job_applications = job_applications.where(job: company_jobs)
          end
        end
        
        render json: job_applications, each_serializer: JobApplicationSerializer, status: :ok
      end
      
      def show
        job_application = JobApplication.find(params[:id])
        
        # Check if user has access to this application
        unless can_access_job_application?(job_application)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        render json: job_application, serializer: JobApplicationSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job application not found" }, status: :not_found
      end

      def create
        job_application = JobApplication.new(job_application_params)
        
        # Ensure the application is associated with the current user's technician profile
        if @current_user.technician?
          technician_profile = @current_user.technician_profile
          if technician_profile.nil?
            begin
              technician_profile = TechnicianProfile.create!(
                user: @current_user,
                trade_type: 'General',
                experience_years: 0,
                availability: 'Full-time'
              )
            rescue => e
              Rails.logger.error("Failed to auto-create technician profile: #{e.message}")
              return render json: { error: "Failed to auto-create technician profile: #{e.message}" }, status: :unprocessable_entity
            end
          end
          job_application.technician_profile = technician_profile
        end
        
        if job_application.save
          render json: job_application, serializer: JobApplicationSerializer, status: :created
        else
          render json: { errors: job_application.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        job_application = JobApplication.find(params[:id])
        
        # Check if user has access to this application
        unless can_access_job_application?(job_application)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        if job_application.update(job_application_params)
          render json: job_application, serializer: JobApplicationSerializer, status: :ok
        else
          render json: { errors: job_application.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job application not found" }, status: :not_found
      end

      def destroy
        job_application = JobApplication.find(params[:id])
        
        # Check if user has access to this application
        unless can_access_job_application?(job_application)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        job_application.destroy
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job application not found" }, status: :not_found
      end

      def accept
        job_application = JobApplication.find(params[:id])
        unless @current_user.company? && job_application.job.company_profile_id == @current_user.company_profile&.id
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        job_application.update(status: :accepted)
        job_application.job.update(status: :reserved)
        render json: job_application, serializer: JobApplicationSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job application not found' }, status: :not_found
      end

      def deny
        job_application = JobApplication.find(params[:id])
        unless @current_user.company? && job_application.job.company_profile_id == @current_user.company_profile&.id
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        job_application.update(status: :rejected)
        render json: job_application, serializer: JobApplicationSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job application not found' }, status: :not_found
      end

      private

      def job_application_params
        params.permit(:status, :job_id, :technician_profile_id)
      end
      
      def can_access_job_application?(job_application)
        if @current_user.technician?
          # Technicians can only access their own applications
          technician_profile = @current_user.technician_profile
          return technician_profile && job_application.technician_profile_id == technician_profile.id
        elsif @current_user.company?
          # Companies can access applications for their jobs
          return job_application.job.company_profile_id == @current_user.company_profile&.id
        end
        false
      end
    end
  end
end 