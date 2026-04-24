module Api
  module V1
    class JobsController < ApplicationController
      before_action :authenticate_user
      before_action :require_company, only: [:create]
      
      def index
        Job.auto_complete_expired!
        jobs = Job.all

        # Companies only see their own jobs; technicians see all open jobs
        if @current_user&.company?
          company_profile = @current_user.company_profile
          jobs = company_profile ? company_profile.jobs : Job.none
        elsif @current_user&.technician?
          technician_profile = @current_user.technician_profile
          if %w[active reserved].include?(params[:status].to_s) && technician_profile
            # Claimed jobs (reserved or filled) - filter by start time for active vs reserved
            base_claimed = Job.joins(:job_applications)
              .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
              .where(status: [:reserved, :filled])
            case params[:status].to_s
            when 'active'
              # Active = in progress (started)
              jobs = base_claimed.where('scheduled_start_at IS NOT NULL AND scheduled_start_at <= ?', Time.current)
            when 'reserved'
              # Reserved/Claimed = claimed but not yet started
              jobs = base_claimed.where('scheduled_start_at IS NULL OR scheduled_start_at > ?', Time.current)
            else
              jobs = base_claimed
            end
          elsif params[:status].to_s == 'completed' && technician_profile
            # Completed: jobs they've done (finished)
            jobs = Job.joins(:job_applications)
              .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
              .where(status: [:finished])
          else
            # Browse: when "All" show all jobs (open, claimed, active, completed); otherwise open/available only
            if params[:status].present?
              jobs = jobs.where.not(status: [:filled, :finished])
              unless params[:include_past] == 'true'
                jobs = jobs.where('scheduled_start_at IS NULL OR scheduled_start_at >= ?', Time.current)
              end
            end
            # Technicians must never see jobs claimed by other technicians
            if technician_profile
              claimed_by_others = Job.joins(:job_applications)
                .where(status: [:reserved, :filled])
                .where(job_applications: { status: :accepted })
                .where.not(job_applications: { technician_profile_id: technician_profile.id })
                .select(:id)
              jobs = jobs.where.not(id: claimed_by_others)

              # Membership early-access gating based on job posted_at (created_at).
              visible_ids = jobs.select(:id).select do |candidate|
                MembershipPolicy.job_visible_to_technician?(job: candidate, technician_profile: technician_profile)
              end.map(&:id)
              jobs = jobs.where(id: visible_ids)
            end
          end
        end

        # Order: most recent first (by created_at, or finished_at for completed)
        jobs = if params[:status].to_s == 'completed'
          jobs.order(Arel.sql('COALESCE(jobs.finished_at, jobs.updated_at, jobs.created_at) DESC'))
        else
          jobs.reorder('jobs.created_at DESC')
        end

        # Apply filters
        jobs = jobs.where(location: params[:location]) if params[:location].present?
        if params[:status].present? && !(@current_user&.technician? && %w[active reserved completed].include?(params[:status].to_s))
          case params[:status].to_s
          when 'active'
            # Active = claimed and in progress (started)
            jobs = jobs.where(status: [:reserved, :filled])
              .where('scheduled_start_at IS NOT NULL AND scheduled_start_at <= ?', Time.current)
          when 'reserved'
            # Reserved/Claimed = claimed but not yet started
            jobs = jobs.where(status: [:reserved, :filled])
              .where('scheduled_start_at IS NULL OR scheduled_start_at > ?', Time.current)
          when 'completed'
            jobs = jobs.where(status: [:finished])
          when 'expired'
            # Expired = open jobs past their scheduled end date (never claimed)
            jobs = jobs.where(status: :open)
              .where('scheduled_end_at IS NOT NULL AND scheduled_end_at <= ?', Time.current)
          else
            jobs = jobs.where(status: params[:status])
          end
        end
        
        # Apply keyword search in title and description
        if params[:keyword].present?
          kw = "%#{params[:keyword]}%"
          jobs = jobs.where(
            "title ILIKE ? OR description ILIKE ? OR skill_class ILIKE ? OR notes ILIKE ?",
            kw, kw, kw, kw
          )
        end

        jobs = jobs.includes(:company_profile, :payments, job_applications: { technician_profile: :user })
        
        render json: jobs,
               each_serializer: JobSerializer,
               include: [:company_profile, { job_applications: { technician_profile: :user } }],
               status: :ok
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
        job = Job.includes(:company_profile, :payments, job_applications: { technician_profile: :user }).find(params[:id])
        if @current_user&.technician? && (tp = @current_user.technician_profile)
          ActiveRecord::Associations::Preloader.new(records: [tp], associations: [:documents]).call
        end
        if @current_user&.company? && job.company_profile_id != @current_user.company_profile&.id
          return render json: { error: "You can only view your own jobs" }, status: :forbidden
        end
        render json: job,
               serializer: JobSerializer,
               include: [:company_profile, { job_applications: { technician_profile: :user } }],
               include_certification_match: true,
               status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def create
        unless PaymentService.company_has_payment_method?(@current_user)
          return render json: { error: 'Add a valid credit or debit card in Profile & Settings → Payment before posting a job.' }, status: :unprocessable_entity
        end

        job = Job.new(job_params)
        if job.save
          CrmProspectPromotion.promote_after_job_created!(job.company_profile_id)
          Rails.logger.info("[mail] job_posted_email job_id=#{job.id}") # confirm this code path + deploy hit Mailtrap
          MailDelivery.safe_deliver { UserMailer.job_posted_email(job).deliver_now }
          render json: job, serializer: JobSerializer, status: :created
        else
          render json: { errors: job.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        job = Job.find(params[:id])
        unless can_manage_job?(job)
          return render json: { error: 'Access denied' }, status: :forbidden
        end
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
        unless can_manage_job?(job)
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        unless job.destroy
          return render json: {
            errors: job.errors.full_messages.presence || ['Unable to delete job']
          }, status: :unprocessable_entity
        end
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
        @current_user.update_column(:company_profile_id, company_profile.id) if @current_user.company_profile_id != company_profile.id

        jobs = company_profile.jobs.includes(:job_applications)

        # claimed = technician has claimed (reserved or filled); unclaimed = open; completed = finished
        # Within each group: most recent first (by finished_at/updated_at/created_at)
        sort_by_recency = ->(a, b) {
          ta = a.finished_at || a.updated_at || a.created_at
          tb = b.finished_at || b.updated_at || b.created_at
          (tb || Time.at(0)) <=> (ta || Time.at(0))
        }
        claimed = jobs.select { |job| job.reserved? || job.filled? }.sort(&sort_by_recency)
        unclaimed = jobs.select { |job| job.open? }.sort(&sort_by_recency)
        completed = jobs.select { |job| job.finished? }.sort(&sort_by_recency)

        render json: {
          requested: ActiveModel::Serializer::CollectionSerializer.new(claimed, serializer: JobSerializer),
          unrequested: ActiveModel::Serializer::CollectionSerializer.new(unclaimed, serializer: JobSerializer),
          expired: ActiveModel::Serializer::CollectionSerializer.new(completed, serializer: JobSerializer)
        }, status: :ok
      end

      # Company denies the claimed technician (refunds if already charged)
      def deny
        job = Job.find(params[:id])
        unless @current_user.company? && job.company_profile_id == @current_user.company_profile&.id
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        unless job.filled?
          return render json: { error: 'Can only deny a claimed job' }, status: :unprocessable_entity
        end

        accepted_app = job.job_applications.find_by(status: :accepted)
        unless accepted_app
          return render json: { error: 'No technician to deny' }, status: :unprocessable_entity
        end

        # Refund if we charged the company
        if job.payments.held.any?
          result = PaymentService.refund_payment(job)
          return render json: { error: result[:error] }, status: :unprocessable_entity if result[:error]
        end

        accepted_app.update!(status: :rejected)
        job.update!(status: :open)
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def finish
        job = Job.find(params[:id])
        can_finish = false
        if @current_user.company? && job.company_profile_id == @current_user.company_profile&.id
          can_finish = true
        elsif @current_user.technician? && (job.reserved? || job.filled?)
          accepted_app = job.job_applications.find_by(status: :accepted)
          can_finish = accepted_app&.technician_profile&.user_id == @current_user.id
        end
        if can_finish
          job.update!(status: :finished, finished_at: Time.current)
          PaymentService.release_if_eligible(job)
          ReferralRewardMarker.mark_for_finished_job!(job)
          MailDelivery.safe_deliver do
            UserMailer.job_completed_for_company(job).deliver_now
            UserMailer.job_completed_for_technician(job).deliver_now
          end
          render json: job, serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
        else
          render json: { error: 'Access denied' }, status: :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def extend
        job = Job.find(params[:id])
        unless @current_user.company? && job.company_profile_id == @current_user.company_profile&.id
          return render json: { error: 'Only the company can extend a job' }, status: :forbidden
        end
        unless job.reserved? || job.filled?
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

        # Pluck ids first: PostgreSQL rejects DISTINCT + ORDER BY non-selected expressions on the same relation.
        job_ids = Job.joins(:job_applications)
          .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
          .distinct
          .pluck(:id)

        in_progress = Job.where(id: job_ids, status: [:reserved, :filled])
          .includes(:company_profile)
          .order(created_at: :desc)
        completed = Job.where(id: job_ids, status: :finished)
          .includes(:company_profile)
          .order(Arel.sql('COALESCE(jobs.finished_at, jobs.updated_at, jobs.created_at) DESC'))

        # Manual JSON to avoid serializer issues (avatar_url, nested associations, etc.)
        job_to_hash = ->(j) {
          {
            id: j.id,
            title: j.title,
            location: j.location,
            status: j.status,
            created_at: j.created_at,
            updated_at: j.updated_at,
            finished_at: j.finished_at,
            scheduled_start_at: j.scheduled_start_at,
            scheduled_end_at: j.scheduled_end_at,
            company_profile: j.company_profile ? { id: j.company_profile.id, company_name: j.company_profile.company_name } : nil
          }
        }

        render json: {
          in_progress: in_progress.map(&job_to_hash),
          completed: completed.map(&job_to_hash)
        }, status: :ok
      rescue StandardError => e
        Rails.logger.error "technician_dashboard_jobs: #{e.class} #{e.message}\n#{e.backtrace.first(5).join("\n")}"
        render json: { in_progress: [], completed: [] }, status: :ok
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

        if job.scheduled_start_at.blank? || job.scheduled_end_at.blank?
          return render json: { error: 'This job has no scheduled times. The company must set start and end times before technicians can claim it.' }, status: :unprocessable_entity
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
            return render json: { error: "You cannot claim this job because its scheduled time overlaps with another job you've already claimed." }, status: :unprocessable_entity
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

        # For paid jobs: charge company immediately (tech claims = job is theirs)
        if job.job_amount_cents > 0
          result = PaymentService.charge_company_on_claim(job)
          if result[:error]
            job_application.destroy!
            job.reload
            return render json: { error: result[:error] }, status: :unprocessable_entity
          end
          job.update!(status: :filled)
          MailDelivery.safe_deliver do
            UserMailer.job_claimed_email(job).deliver_now
            UserMailer.payment_confirmation_email(job, job.company_charge_cents).deliver_now
            UserMailer.technician_claimed_job_email(job).deliver_now
          end
        else
          job.update!(status: :filled)
          MailDelivery.safe_deliver do
            UserMailer.job_claimed_email(job).deliver_now
            UserMailer.technician_claimed_job_email(job).deliver_now
          end
        end

        render json: job, serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def job_params
        params.permit(:title, :description, :required_documents, :required_certifications, :location, :status, :company_profile_id, :timeline,
                      :scheduled_start_at, :scheduled_end_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
                      :address, :city, :state, :zip_code, :country,
                      :skill_class, :minimum_years_experience, :notes)
      end

      def jobs_overlap?(job_a, job_b)
        # If either job has missing times, we cannot verify no overlap - treat as overlapping to prevent double-booking
        return true if job_a.scheduled_start_at.blank? || job_a.scheduled_end_at.blank? || job_b.scheduled_start_at.blank? || job_b.scheduled_end_at.blank?
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

      # Company: own jobs only. Admin: any job, any status (open, claimed, finished, expired-open, etc.).
      def can_manage_job?(job)
        return true if @current_user&.admin?
        @current_user&.company? && job.company_profile_id == @current_user.company_profile&.id
      end
    end
  end
end 
