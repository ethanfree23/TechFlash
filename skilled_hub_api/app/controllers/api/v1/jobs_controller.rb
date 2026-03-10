module Api
  module V1
    class JobsController < ApplicationController
      before_action :authenticate_user
      before_action :require_company, only: [:create, :update, :destroy]
      
      def index
        jobs = Job.all

        # Companies only see their own jobs; technicians see all open jobs
        if @current_user&.company?
          company_profile = @current_user.company_profile
          jobs = company_profile ? company_profile.jobs : Job.none
        elsif @current_user&.technician?
          # Hide filled/finished jobs from technicians
          jobs = jobs.where.not(status: [:filled, :finished])
        end

        # Apply filters
        jobs = jobs.where(location: params[:location]) if params[:location].present?
        jobs = jobs.where(status: params[:status]) if params[:status].present?
        
        # Apply keyword search in title and description
        if params[:keyword].present?
          jobs = jobs.where("title ILIKE ? OR description ILIKE ?", 
                           "%#{params[:keyword]}%", "%#{params[:keyword]}%")
        end
        
        render json: jobs, each_serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      end
      
      def show
        job = Job.find(params[:id])
        if @current_user&.company? && job.company_profile.user_id != @current_user.id
          return render json: { error: "You can only view your own jobs" }, status: :forbidden
        end
        render json: job, serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def create
        job = Job.new(job_params)
        if job.save
          render json: job, serializer: JobSerializer, status: :created
        else
          render json: { errors: job.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        job = Job.find(params[:id])
        if job.update(job_params)
          render json: job, serializer: JobSerializer, status: :ok
        else
          render json: { errors: job.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def destroy
        job = Job.find(params[:id])
        job.destroy
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def dashboard_jobs
        unless @current_user&.company?
          return render json: { error: 'Access denied. Company role required.' }, status: :forbidden
        end

        company_profile = @current_user.company_profile
        return render json: { error: 'Company profile not found' }, status: :not_found unless company_profile

        jobs = company_profile.jobs.includes(:job_applications)

        # claimed = technician has claimed (reserved); unclaimed = open, no claim; completed = finished/filled
        claimed = jobs.select { |job| job.reserved? }
        unclaimed = jobs.select { |job| job.open? }
        completed = jobs.select { |job| job.finished? || job.filled? }

        render json: {
          requested: ActiveModel::Serializer::CollectionSerializer.new(claimed, serializer: JobSerializer),
          unrequested: ActiveModel::Serializer::CollectionSerializer.new(unclaimed, serializer: JobSerializer),
          expired: ActiveModel::Serializer::CollectionSerializer.new(completed, serializer: JobSerializer)
        }, status: :ok
      end

      def accept
        job = Job.find(params[:id])
        if @current_user.company? && job.company_profile.user_id == @current_user.id
          job.update(status: :filled)
          render json: job, serializer: JobSerializer, status: :ok
        else
          render json: { error: 'Access denied' }, status: :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def finish
        job = Job.find(params[:id])
        if @current_user.company? && job.company_profile.user_id == @current_user.id
          job.update(status: :finished, finished_at: Time.current)
          render json: job, serializer: JobSerializer, status: :ok
        else
          render json: { error: 'Access denied' }, status: :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def technician_dashboard_jobs
        unless @current_user&.technician?
          return render json: { error: 'Access denied. Technician role required.' }, status: :forbidden
        end

        technician_profile = @current_user.technician_profile
        return render json: { in_progress: [], completed: [] }, status: :ok unless technician_profile

        base = Job.joins(:job_applications)
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .distinct
          .includes(:company_profile, :job_applications)

        in_progress = base.where(status: :reserved)
        completed = base.where(status: [:finished, :filled])

        render json: {
          in_progress: ActiveModel::Serializer::CollectionSerializer.new(in_progress, serializer: JobSerializer),
          completed: ActiveModel::Serializer::CollectionSerializer.new(completed, serializer: JobSerializer)
        }, status: :ok
      end

      # Technician claims a job (first-come-first-served, like Uber driver accepting a ride)
      def claim
        job = Job.find(params[:id])
        unless @current_user.technician?
          return render json: { error: 'Only technicians can claim jobs' }, status: :forbidden
        end

        unless job.open?
          return render json: { error: 'Job is no longer available' }, status: :unprocessable_entity
        end

        if job.job_applications.accepted.any?
          return render json: { error: 'Job has already been claimed' }, status: :unprocessable_entity
        end

        technician_profile = @current_user.technician_profile
        if technician_profile.nil?
          technician_profile = TechnicianProfile.create!(
            user: @current_user,
            trade_type: 'General',
            experience_years: 0,
            availability: 'Full-time'
          )
        end

        job_application = JobApplication.create!(
          job: job,
          technician_profile: technician_profile,
          status: :accepted
        )
        job.update!(status: :reserved)

        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def job_params
        params.permit(:title, :description, :required_documents, :location, :status, :company_profile_id, :timeline)
      end
    end
  end
end 