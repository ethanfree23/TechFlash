module Api
  module V1
    class JobsController < ApplicationController
      before_action :authenticate_user
      before_action :require_company, only: [:create, :update, :destroy]
      
      def index
        Job.auto_complete_expired!
        jobs = Job.all

        # Companies only see their own jobs; technicians see all open jobs
        if @current_user&.company?
          company_profile = @current_user.company_profile
          jobs = company_profile ? company_profile.jobs : Job.none
        elsif @current_user&.technician?
          technician_profile = @current_user.technician_profile
          if params[:status].to_s == 'current' && technician_profile
            # In-progress: jobs they've claimed (reserved or filled)
            jobs = Job.joins(:job_applications)
              .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
              .where(status: [:reserved, :filled])
          elsif params[:status].to_s == 'completed' && technician_profile
            # Completed: jobs they've done (finished)
            jobs = Job.joins(:job_applications)
              .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
              .where(status: [:finished])
          else
            # Browse: open and reserved (hide filled/finished)
            jobs = jobs.where.not(status: [:filled, :finished])
            unless params[:include_past] == 'true'
              jobs = jobs.where('scheduled_start_at IS NULL OR scheduled_start_at >= ?', Time.current)
            end
          end
        end

        # Apply filters
        jobs = jobs.where(location: params[:location]) if params[:location].present?
        if params[:status].present? && !(@current_user&.technician? && %w[current completed].include?(params[:status].to_s))
          case params[:status].to_s
          when 'active'
            # Active = claimed and in progress (reserved + filled)
            jobs = jobs.where(status: [:reserved, :filled])
          when 'current'
            # Current = in progress (reserved + filled)
            jobs = jobs.where(status: [:reserved, :filled])
          when 'completed'
            jobs = jobs.where(status: [:finished])
          else
            jobs = jobs.where(status: params[:status])
          end
        end
        
        # Apply keyword search in title and description
        if params[:keyword].present?
          jobs = jobs.where("title ILIKE ? OR description ILIKE ?", 
                           "%#{params[:keyword]}%", "%#{params[:keyword]}%")
        end
        
        render json: jobs, each_serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      end

      def locations
        jobs = Job.all
        if @current_user&.company?
          company_profile = @current_user.company_profile
          jobs = company_profile ? company_profile.jobs : Job.none
        elsif @current_user&.technician?
          jobs = jobs.where.not(status: [:filled, :finished])
        end
        locs = jobs.where.not(location: [nil, '']).distinct.pluck(:location).sort
        render json: { locations: locs }, status: :ok
      end
      
      def show
        Job.auto_complete_expired!
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
          UserMailer.job_posted_email(job).deliver_later
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
        Job.auto_complete_expired!
        unless @current_user&.company?
          return render json: { error: 'Access denied. Company role required.' }, status: :forbidden
        end

        company_profile = @current_user.company_profile
        company_profile ||= CompanyProfile.create!(user_id: @current_user.id)

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
        unless @current_user.company? && job.company_profile.user_id == @current_user.id
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        unless job.reserved?
          return render json: { error: 'Job must be claimed before accepting' }, status: :unprocessable_entity
        end

        # If job has a price, require successful payment before accepting
        if job.job_amount_cents > 0
          payment_intent_id = params[:payment_intent_id]
          if payment_intent_id.blank?
            return render json: { error: 'Payment required. Call create_payment_intent first, then confirm with Stripe.' }, status: :unprocessable_entity
          end

          result = capture_payment_and_hold(job, payment_intent_id)
          if result[:error]
            return render json: { error: result[:error] }, status: :unprocessable_entity
          end
        end

        job.update!(status: :filled)
        UserMailer.job_accepted_email(job).deliver_later
        if job.job_amount_cents > 0
          UserMailer.payment_confirmation_email(job, job.company_charge_cents).deliver_later
        end
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def finish
        job = Job.find(params[:id])
        can_finish = false
        if @current_user.company? && job.company_profile.user_id == @current_user.id
          can_finish = true
        elsif @current_user.technician? && job.reserved?
          accepted_app = job.job_applications.find_by(status: :accepted)
          can_finish = accepted_app&.technician_profile&.user_id == @current_user.id
        end
        if can_finish
          job.update!(status: :finished, finished_at: Time.current)
          PaymentService.release_if_eligible(job)
          render json: job, serializer: JobSerializer, status: :ok
        else
          render json: { error: 'Access denied' }, status: :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def extend
        job = Job.find(params[:id])
        unless @current_user.company? && job.company_profile.user_id == @current_user.id
          return render json: { error: 'Only the company can extend a job' }, status: :forbidden
        end
        unless job.reserved?
          return render json: { error: 'Can only extend jobs that are in progress' }, status: :unprocessable_entity
        end
        new_end_at = params[:scheduled_end_at]
        if new_end_at.blank?
          return render json: { error: 'scheduled_end_at is required' }, status: :unprocessable_entity
        end
        new_end = Time.zone.parse(new_end_at.to_s)
        if new_end.nil? || new_end <= Time.current
          return render json: { error: 'New end time must be in the future' }, status: :unprocessable_entity
        end
        if job.scheduled_end_at && new_end <= job.scheduled_end_at
          return render json: { error: 'New end time must be later than current end time' }, status: :unprocessable_entity
        end
        job.update!(scheduled_end_at: new_end)
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def technician_dashboard_jobs
        Job.auto_complete_expired!
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
        if technician_profile
          overlapping = technician_profile.job_applications
            .joins(:job)
            .where(job_applications: { status: :accepted })
            .where(jobs: { status: [:reserved, :filled] })
            .where.not(jobs: { id: job.id })
            .select { |app| jobs_overlap?(app.job, job) }
          if overlapping.any?
            return render json: { error: 'You cannot claim this job because it overlaps with another job you have reserved.' }, status: :unprocessable_entity
          end
        end
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
        UserMailer.job_claimed_email(job).deliver_later

        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def job_params
        params.permit(:title, :description, :required_documents, :location, :status, :company_profile_id, :timeline,
                      :scheduled_start_at, :scheduled_end_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
                      :address, :city, :state, :zip_code, :country)
      end

      def jobs_overlap?(job_a, job_b)
        return false unless job_a.scheduled_start_at && job_a.scheduled_end_at && job_b.scheduled_start_at && job_b.scheduled_end_at
        start_a = job_a.scheduled_start_at
        end_a = job_a.scheduled_end_at
        start_b = job_b.scheduled_start_at
        end_b = job_b.scheduled_end_at
        start_a < end_b && end_a > start_b
      end

      def capture_payment_and_hold(job, payment_intent_id)
        return { error: 'Stripe not configured' } if Stripe.api_key.blank?

        intent = Stripe::PaymentIntent.retrieve(payment_intent_id)
        unless intent.status == 'succeeded'
          return { error: 'Payment not completed. Please complete the payment first.' }
        end
        unless intent.metadata['job_id'].to_s == job.id.to_s
          return { error: 'Payment does not match this job' }
        end

        payment = job.payments.find_or_initialize_by(stripe_payment_intent_id: payment_intent_id)
        if payment.persisted? && payment.held?
          return {} # Already captured
        end

        # amount_cents = what we transfer to tech (95% of job amount)
        payment.assign_attributes(
          amount_cents: job.tech_payout_cents,
          status: 'held',
          held_at: Time.current
        )
        payment.save!
        {}
      rescue Stripe::StripeError => e
        { error: e.message }
      end
    end
  end
end 