module Api
  module V1
    class JobsController < ApplicationController
      before_action :authenticate_user

      def index
        Job.auto_complete_expired!
        jobs = Job.all

        # Companies only see their own jobs; technicians see all open jobs
        if @current_user&.company?
          company_profile = @current_user.company_profile
          jobs = company_profile ? company_profile.jobs : Job.none
        elsif @current_user&.technician?
          technician_profile = @current_user.technician_profile
          # #region agent log
          debug_log(
            hypothesis_id: 'B1',
            location: 'jobs_controller.rb:index:technician_entry',
            message: 'technician index entry',
            data: {
              status_param: params[:status].to_s,
              include_past: params[:include_past].to_s,
              technician_profile_id: technician_profile&.id,
              initial_jobs_count: Job.count
            }
          )
          # #endregion
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
                # Open jobs should remain visible through their end time,
                # even after their start time has passed.
                jobs = jobs.where('scheduled_end_at IS NULL OR scheduled_end_at >= ?', Time.current)
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
              # #region agent log
              debug_log(
                hypothesis_id: 'B2',
                location: 'jobs_controller.rb:index:pre_membership_filter',
                message: 'pre membership gating sample',
                data: {
                  status_param: params[:status].to_s,
                  pre_membership_count: jobs.count,
                  sample_job_ids: jobs.limit(5).pluck(:id)
                }
              )
              # #endregion

              jobs = MembershipPolicy.apply_technician_visibility_scope(jobs, technician_profile)
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

        render_paginated_jobs(jobs)
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
        if @current_user&.technician? && (tp = @current_user.technician_profile)
          unless MembershipPolicy.job_visible_to_technician?(job: job, technician_profile: tp)
            return render json: { error: "This job is not available for your tier yet." }, status: :forbidden
          end
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
        unless @current_user&.company? || @current_user&.admin?
          return render json: { error: 'Access denied. Company or admin role required.' }, status: :forbidden
        end

        company_profile = resolve_company_profile_for_create
        return if performed?

        requires_saved_card = !MembershipPolicy.billing_exempt?(company_profile)
        skip_card_validation = @current_user&.admin? && ActiveModel::Type::Boolean.new.cast(params[:skip_card_validation])
        if requires_saved_card && !skip_card_validation && !PaymentService.company_has_payment_method?(company_profile.user)
          return render json: { error: 'Add a valid credit or debit card in Profile & Settings → Payment before posting a job.' }, status: :unprocessable_entity
        end

        job = Job.new(job_params.except(:company_profile_id, :skip_card_validation))
        job.company_profile_id = company_profile.id
        # Mobile payloads should create posted/open jobs even if status is omitted.
        job.status = :open if job.status.blank?
        set_go_live_at_for_post!(job)
        if job.save
          CrmProspectPromotion.promote_after_job_created!(job.company_profile_id)
          JobAlertDispatcher.dispatch_for_job(job) if job.open?
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
        job.assign_attributes(job_params)
        if blocking_open_while_claimed?(job)
          return render json: {
            error: 'Cannot set job to open while a technician claim is accepted. Use Deny Technician first, or ask an admin.'
          }, status: :unprocessable_entity
        end
        set_go_live_at_for_post!(job)
        if job.save
          JobAlertDispatcher.dispatch_for_job(job) if job.open?
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

        limit = (params[:limit].presence || 25).to_i.clamp(1, 100)
        recency = Arel.sql("COALESCE(jobs.finished_at, jobs.updated_at, jobs.created_at) DESC")
        base = company_profile.jobs

        claimed_scope = base.where(status: %i[reserved filled])
        unclaimed_scope = base.where(status: :open)
        completed_scope = base.where(status: :finished)

        claimed = claimed_scope.includes(:job_applications).order(recency).limit(limit)
        unclaimed = unclaimed_scope.includes(:job_applications).order(recency).limit(limit)
        completed = completed_scope.includes(:job_applications).order(recency).limit(limit)

        render json: {
          counts: {
            requested: claimed_scope.count,
            unrequested: unclaimed_scope.count,
            completed: completed_scope.count,
            total: base.count
          },
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
        job.update!(status: :open, go_live_at: Time.current)
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
        result = Jobs::ClaimJobService.call(
          job: job,
          technician_user: @current_user,
          preferred_start_at: params[:preferred_start_at]
        )
        if result[:error]
          return render json: {
            error: result[:error],
            verification_required: result[:verification_required] || false,
            verification_reasons: result[:verification_reasons] || []
          }, status: (result[:status] || :unprocessable_entity)
        end

        render json: job, serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def resolve_company_profile_for_create
        if @current_user&.company?
          profile = @current_user.company_profile
          if profile.blank?
            render json: { error: 'Company profile not found for current user' }, status: :unprocessable_entity
            return nil
          end
          return profile
        end

        profile = CompanyProfile.find_by(id: params[:company_profile_id])
        if profile.blank?
          render json: { error: 'Valid company_profile_id is required for admin job creation' }, status: :unprocessable_entity
          return nil
        end
        profile
      end

      def job_params
        params.permit(:title, :description, :required_documents, :required_certifications, :location, :status, :company_profile_id, :timeline, :skip_card_validation,
                      :scheduled_start_at, :scheduled_end_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days,
                      :address, :city, :state, :zip_code, :country, :latitude, :longitude,
                      :skill_class, :minimum_years_experience, :notes, :go_live_at, :start_mode,
                      :require_background_check, :require_identity_verification, :minimum_verified_references, :require_insurance_verification,
                      :rolling_start_rule_type, :rolling_start_exact_start_at, :rolling_start_days_after_acceptance,
                      :rolling_start_weekday, :rolling_start_weekday_time)
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

      # Posting should make the job live immediately.
      # Any publish event (create as open, or draft -> open) anchors tier visibility at current time.
      def set_go_live_at_for_post!(job)
        return unless job.status.to_s == "open"
        return unless job.new_record? || job.will_save_change_to_status? || job.will_save_change_to_go_live_at?

        job.go_live_at = Time.current
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

      def render_paginated_jobs(jobs)
        page = params[:page].presence&.to_i
        per_page = (params[:per_page].presence || default_jobs_per_page).to_i.clamp(1, 100)

        if page.present? && page.positive?
          total = jobs.count
          records = jobs.offset((page - 1) * per_page).limit(per_page)
          serialized = ActiveModelSerializers::SerializableResource.new(
            records,
            each_serializer: JobSerializer,
            include: [:company_profile, { job_applications: { technician_profile: :user } }]
          ).as_json
          render json: {
            jobs: serialized,
            meta: {
              total: total,
              page: page,
              per_page: per_page,
              total_pages: [(total.to_f / per_page).ceil, 1].max
            }
          }, status: :ok
          return
        end

        # Legacy unpaginated response — cap technician browse to avoid multi-MB payloads.
        cap = @current_user&.technician? ? 100 : nil
        records = cap ? jobs.limit(cap) : jobs

        render json: records,
               each_serializer: JobSerializer,
               include: [:company_profile, { job_applications: { technician_profile: :user } }],
               status: :ok
      end

      def default_jobs_per_page
        @current_user&.company? ? 24 : 36
      end

      # Companies must not reopen via arbitrary PATCH while a claim is accepted (use deny flow). Admins may override.
      def blocking_open_while_claimed?(job)
        return false if @current_user&.admin?
        return false unless job.status.to_s == "open"
        return false unless job.will_save_change_to_status?

        job.job_applications.where(status: :accepted).exists?
      end

      def debug_log(hypothesis_id:, location:, message:, data:)
        File.open(Rails.root.join('..', 'debug-f0f940.log'), 'a') do |f|
          f.puts({
            sessionId: 'f0f940',
            runId: 'initial',
            hypothesisId: hypothesis_id,
            location: location,
            message: message,
            data: data,
            timestamp: (Time.now.to_f * 1000).to_i
          }.to_json)
        end
      rescue StandardError
        nil
      end
    end
  end
end 
