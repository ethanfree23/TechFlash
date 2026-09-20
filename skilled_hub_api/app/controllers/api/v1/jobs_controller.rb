module Api
  module V1
    class JobsController < ApplicationController
      before_action :authenticate_user

      def index
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
              jobs = base_claimed.merge(Job.effectively_active)
            when 'reserved'
              jobs = base_claimed.merge(Job.effectively_claimed)
            else
              jobs = base_claimed
            end
          elsif %w[completed ended_early concluded].include?(params[:status].to_s) && technician_profile
            history = Job.joins(:job_applications)
              .where(job_applications: { technician_profile_id: technician_profile.id, status: :accepted })
            jobs = case params[:status].to_s
                   when 'ended_early' then history.merge(Job.effectively_ended_early)
                   when 'concluded' then history.merge(Job.effectively_concluded)
                   else history.merge(Job.effectively_completed)
                   end
          else
            # Browse: when "All" show available + the tech's own claimed/completed work.
            jobs = jobs.where.not(status: :pending_funding)
            if params[:status].present?
              jobs = jobs.where.not(status: [:filled, :finished])
            end
            unless params[:include_past] == 'true'
              jobs = jobs.where.not(id: Job.expired_listings.select(:id))
            end
            # Technicians must never see jobs claimed by other technicians
            if technician_profile
              claimed_by_others = Job.joins(:job_applications)
                .where(status: [:reserved, :filled])
                .where(job_applications: { status: :accepted })
                .where.not(job_applications: { technician_profile_id: technician_profile.id })
                .select(:id)
              jobs = jobs.where.not(id: claimed_by_others)

              jobs = MembershipPolicy.apply_technician_visibility_scope(jobs, technician_profile)
            end
          end
        end

        # Order: most recent first (by created_at, or finished_at for completed)
        jobs = if %w[completed ended_early concluded].include?(params[:status].to_s)
          jobs.order(Arel.sql('COALESCE(jobs.finished_at, jobs.updated_at, jobs.created_at) DESC'))
        else
          jobs.reorder('jobs.created_at DESC')
        end

        # Apply filters
        jobs = jobs.where(location: params[:location]) if params[:location].present?
        if params[:status].present? && !(@current_user&.technician? && %w[active reserved completed ended_early concluded].include?(params[:status].to_s))
          case params[:status].to_s
          when 'active'
            jobs = jobs.merge(Job.effectively_active)
          when 'reserved'
            jobs = jobs.merge(Job.effectively_claimed)
          when 'in_progress'
            jobs = jobs.merge(Job.in_progress)
          when 'completed'
            jobs = jobs.merge(Job.effectively_completed)
          when 'ended_early'
            jobs = jobs.merge(Job.effectively_ended_early)
          when 'concluded'
            jobs = jobs.merge(Job.effectively_concluded)
          when 'expired'
            jobs = jobs.merge(Job.expired_listings)
          when 'open'
            jobs = jobs.merge(Job.effectively_open)
          else
            jobs = jobs.where(status: params[:status])
          end
        end
        
        if params[:potential_full_time].present? && ActiveModel::Type::Boolean.new.cast(params[:potential_full_time])
          jobs = jobs.merge(Job.potential_full_time_only) if Job.column_names.include?("potential_full_time")
        end

        # Apply keyword search in title and description
        if params[:keyword].present?
          kw = "%#{params[:keyword]}%"
          jobs = jobs.where(
            "title ILIKE ? OR description ILIKE ? OR skill_class ILIKE ? OR trade_type ILIKE ? OR notes ILIKE ?",
            kw, kw, kw, kw, kw
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
          jobs = jobs.where.not(status: [:filled, :finished, :pending_funding])
            .where.not(id: Job.expired_listings.select(:id))
        end
        locs = jobs.where.not(location: [nil, ""]).distinct.pluck(:location)
        render json: { locations: Array(locs).map { |loc| loc.to_s.strip }.reject(&:blank?).uniq.sort }, status: :ok
      end
      
      def show
        job = Job.includes(:company_profile, :payments, job_applications: { technician_profile: :user }).find(params[:id])
        if @current_user&.technician? && (tp = @current_user.technician_profile)
          ActiveRecord::Associations::Preloader.new(records: [tp], associations: [:documents]).call
        end
        if @current_user&.company? && job.company_profile_id != @current_user.company_profile&.id
          return render json: { error: "You can only view your own jobs" }, status: :forbidden
        end
        if @current_user&.technician? && job.pending_funding?
          return render json: { error: "Job not found" }, status: :not_found
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

        requires_saved_card = !company_profile.job_funding_waived?
        skip_card_validation = @current_user&.admin? && ActiveModel::Type::Boolean.new.cast(params[:skip_card_validation])
        priced_preview = JobMoney.labor_cents(
          hourly_rate_cents: job_params[:hourly_rate_cents],
          hours_per_day: job_params[:hours_per_day],
          days: job_params[:days],
          fallback_cents: job_params[:price_cents].to_i
        )
        if requires_saved_card && priced_preview.positive? && !skip_card_validation && !PaymentService.company_has_payment_method?(company_profile.user)
          return render json: { error: 'Add a valid credit or debit card in Profile & Settings → Payment before posting a job.' }, status: :unprocessable_entity
        end

        job = Job.new(job_params.except(:company_profile_id, :skip_card_validation))
        job.company_profile_id = company_profile.id
        job.pay_basis = params[:pay_basis] if params[:pay_basis].present?
        needs_funding = job.priced? && !job.job_funding_waived?
        job.status = needs_funding ? :pending_funding : :open
        trade_validation_error = assign_and_validate_trade_type!(job: job, company_profile: company_profile)
        if trade_validation_error.present?
          return render json: { error: trade_validation_error }, status: :unprocessable_entity
        end
        skill_class_error = assign_and_validate_skill_class!(job, required: true)
        if skill_class_error.present?
          return render json: { error: skill_class_error }, status: :unprocessable_entity
        end
        set_go_live_at_for_post!(job) unless needs_funding
        unless job.save
          return render json: { errors: job.errors.full_messages }, status: :unprocessable_entity
        end

        if needs_funding
          result = JobFundingService.fund_for_publish!(job)
          if result[:requires_action]
            return render json: {
              job: JobSerializer.new(job.reload, scope: @current_user).as_json,
              payment_adjustment_required: true,
              client_secret: result[:client_secret]
            }, status: :accepted
          end
          unless result[:success]
            return render json: { error: result[:error] || "Payment failed. This job was not published.", job: JobSerializer.new(job.reload, scope: @current_user).as_json }, status: :unprocessable_entity
          end
          job.reload
        else
          JobFundingService.snapshot_company!(job)
          job.update!(funding_status: :funded)
          JobFundingService.record_revision!(job, source: "posting")
        end

        CrmProspectPromotion.promote_after_job_created!(job.company_profile_id)
        JobAlertDispatcher.dispatch_for_job(job) if job.effectively_open?
        Rails.logger.info("[mail] job_posted_email job_id=#{job.id}")
        MailDelivery.safe_deliver { UserMailer.job_posted_email(job).deliver_now }
        render json: job, serializer: JobSerializer, status: :created
      end

      def update
        job = Job.find(params[:id])
        unless can_manage_job?(job)
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        if job.terminated_early?
          return render json: {
            error: 'This assignment was ended early and can no longer be edited.'
          }, status: :unprocessable_entity
        end
        previous_weekend_policy = job.weekend_work_policy
        previous_sat_multiplier = job.saturday_multiplier
        previous_sun_multiplier = job.sunday_multiplier
        incoming = job_params
        if (status_error = disallowed_status_change_error(job, incoming))
          return render json: { error: status_error }, status: :unprocessable_entity
        end
        if job.funded_terms_locked?
          locked = %w[hourly_rate_cents hours_per_day days pay_basis price_cents]
          changed_locked = locked.select { |attr| incoming.key?(attr) && incoming[attr].to_s != job.public_send(attr).to_s }
          if changed_locked.any?
            return render json: {
              error: "Funded job pay terms cannot be edited directly. Use a counteroffer or unpublish the job."
            }, status: :unprocessable_entity
          end
        end
        job.assign_attributes(incoming)
        trade_validation_error = assign_and_validate_trade_type!(job: job, company_profile: job.company_profile)
        if trade_validation_error.present?
          return render json: { error: trade_validation_error }, status: :unprocessable_entity
        end
        skill_class_error = assign_and_validate_skill_class!(job, required: params.key?(:skill_class))
        if skill_class_error.present?
          return render json: { error: skill_class_error }, status: :unprocessable_entity
        end
        if blocking_open_while_claimed?(job)
          return render json: {
            error: 'Cannot set job to open while a technician claim is accepted. Use Deny Technician first, or ask an admin.'
          }, status: :unprocessable_entity
        end
        if optional_to_required_change_after_claim?(job, previous_weekend_policy)
          return render json: {
            error: 'You cannot change optional weekend work to required after a technician has claimed the job without technician acceptance.'
          }, status: :unprocessable_entity
        end
        if lowering_multiplier_with_locked_entries?(job, previous_sat_multiplier, previous_sun_multiplier)
          return render json: {
            error: 'Weekend multipliers cannot be reduced after approved or paid weekend hours exist.'
          }, status: :unprocessable_entity
        end
        set_go_live_at_for_post!(job)
        if job.save
          Jobs::TermChangeAuditLogger.log!(job: job, actor_user: @current_user, reason: params[:change_reason])
          # A pending alternate-schedule proposal was calculated against the old terms.
          Schedule::ProposalInvalidator.invalidate_stale_for_job!(job, reason: "company_edited_job")
          JobAlertDispatcher.dispatch_for_job(job) if job.effectively_open?
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
        if (reason = undeletable_reason(job))
          return render json: { error: reason, errors: [reason] }, status: :unprocessable_entity
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
        unless @current_user&.company?
          return render json: { error: 'Access denied. Company role required.' }, status: :forbidden
        end

        company_profile = @current_user.company_profile
        company_profile ||= CompanyProfile.create!(user_id: @current_user.id)
        @current_user.update_column(:company_profile_id, company_profile.id) if @current_user.company_profile_id != company_profile.id

        limit = (params[:limit].presence || 25).to_i.clamp(1, 100)
        recency = Arel.sql("COALESCE(jobs.finished_at, jobs.updated_at, jobs.created_at) DESC")
        base = company_profile.jobs

        claimed_scope = base.merge(Job.in_progress)
        unclaimed_scope = base.merge(Job.effectively_open)
        expired_listings_scope = base.merge(Job.expired_listings)
        completed_scope = base.merge(Job.effectively_completed)
        ended_early_scope = base.merge(Job.effectively_ended_early)

        claimed = claimed_scope.includes(:job_applications).order(recency).limit(limit)
        unclaimed = unclaimed_scope.includes(:job_applications).order(recency).limit(limit)
        expired_listings = expired_listings_scope.includes(:job_applications).order(recency).limit(limit)
        completed = completed_scope.includes(:job_applications).order(recency).limit(limit)
        ended_early = ended_early_scope.includes(:job_applications, :job_termination).order(recency).limit(limit)

        completed_payload = ActiveModel::Serializer::CollectionSerializer.new(completed, serializer: JobSerializer)
        render json: {
          counts: {
            requested: claimed_scope.count,
            unrequested: unclaimed_scope.count,
            completed: completed_scope.count,
            ended_early: ended_early_scope.count,
            expired_listings: expired_listings_scope.count,
            total: base.count
          },
          requested: ActiveModel::Serializer::CollectionSerializer.new(claimed, serializer: JobSerializer),
          unrequested: ActiveModel::Serializer::CollectionSerializer.new(unclaimed, serializer: JobSerializer),
          expired_listings: ActiveModel::Serializer::CollectionSerializer.new(expired_listings, serializer: JobSerializer),
          completed: completed_payload,
          ended_early: ActiveModel::Serializer::CollectionSerializer.new(ended_early, serializer: JobSerializer),
          expired: completed_payload
        }, status: :ok
      end

      # Company denies the claimed technician. Job funding stays on the job.
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

        if job.time_entries.where(status: [:approved, :paid]).exists?
          return render json: {
            error: 'This technician already has approved hours on the job. Use "End Assignment" so their approved work is paid and your remaining funds are refunded.'
          }, status: :unprocessable_entity
        end

        accepted_app.update!(status: :rejected)
        JobFundingService.clear_technician_snapshot!(job)
        job.update!(status: :open, go_live_at: Time.current)
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def terminate
        job = Job.find(params[:id])
        result = Jobs::TerminateAssignmentService.call(
          job: job,
          actor_user: @current_user,
          reason: params[:reason],
          notes: params[:notes],
          effective_end_at: params[:effective_end_at]
        )

        unless result.success?
          return render json: { error: result.error, blockers: result.blockers }.compact, status: (result.status || :unprocessable_entity)
        end

        render json: {
          job: JobSerializer.new(result.job, scope: @current_user).as_json,
          termination: JobTerminationSerializer.new(result.termination).as_json,
          idempotent: !!result.idempotent
        }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def termination_preview
        job = Job.find(params[:id])
        unless can_manage_job?(job)
          return render json: { error: 'Access denied' }, status: :forbidden
        end

        summary = Jobs::TerminationSummary.call(job: job, effective_end_at: params[:effective_end_at])
        render json: { termination_preview: summary.as_json }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def finish
        job = Job.find(params[:id])
        can_finish = false
        if @current_user.admin?
          can_finish = true
        elsif @current_user.company? && job.company_profile_id == @current_user.company_profile&.id
          can_finish = true
        elsif @current_user.technician? && (job.reserved? || job.filled?)
          accepted_app = job.job_applications.find_by(status: :accepted)
          can_finish = accepted_app&.technician_profile&.user_id == @current_user.id
        end
        if job.terminated_early?
          return render json: { error: 'This assignment was already ended early.' }, status: :unprocessable_entity
        end
        if can_finish
          job.update!(status: :finished, finished_at: Time.current) unless job.finished? || job.completed?
          JobSettlementService.settle_and_release_if_eligible!(job)
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
        Schedule::ProposalInvalidator.invalidate_stale_for_job!(job, reason: "company_extended_job")
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def technician_dashboard_jobs
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
            effective_status: j.effective_status,
            ended_early: j.terminated_early?,
            terminated_at: j.terminated_at,
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
          technician_user: @current_user
        )
        if result[:error]
          return render json: {
            error: result[:error],
            verification_required: result[:verification_required] || false,
            verification_reasons: result[:verification_reasons] || [],
            # Present when the job overlaps an existing commitment: the client turns Claim
            # into an alternate-schedule proposal using these pre-computed options.
            schedule_conflict: result[:schedule_conflict] || false,
            schedule_conflict_details: result[:schedule_conflict_details]
          }.compact, status: (result[:status] || :unprocessable_entity)
        end

        render json: job, serializer: JobSerializer, include: [:company_profile, { job_applications: { technician_profile: :user } }], status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      # Conflict classification plus the alternate schedules TechFlash can offer, so the
      # technician never has to work out dates that TechFlash already knows.
      def schedule_availability
        job = Job.find(params[:id])
        unless @current_user&.technician?
          return render json: { error: 'Access denied. Technician role required.' }, status: :forbidden
        end

        technician_profile = @current_user.technician_profile
        if technician_profile.blank?
          return render json: { classification: Schedule::JobAvailabilityClassifier::AVAILABLE, options: [] }, status: :ok
        end

        render json: Schedule::JobAvailabilityClassifier.payload(
          job: job,
          technician_profile: technician_profile
        ), status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      def confirm_funding
        job = Job.find(params[:id])
        unless can_manage_job?(job)
          return render json: { error: "Access denied" }, status: :forbidden
        end

        result = JobFundingService.confirm_requires_action!(job)
        if result[:error]
          return render json: result, status: :unprocessable_entity
        end
        if job.reload.effectively_open?
          JobAlertDispatcher.dispatch_for_job(job)
          MailDelivery.safe_deliver { UserMailer.job_posted_email(job).deliver_now }
        end
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      def unpublish
        job = Job.find(params[:id])
        unless can_manage_job?(job)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        unless job.open? || job.pending_funding?
          return render json: { error: "Only unfilled jobs can be unpublished." }, status: :unprocessable_entity
        end
        if job.job_applications.accepted.any?
          return render json: { error: "Deny the technician before unpublishing." }, status: :unprocessable_entity
        end

        result = JobFundingAdjustmentService.refund_unfilled_job!(job)
        return render json: { error: result[:error] }, status: :unprocessable_entity if result[:error]

        job.update!(status: :pending_funding, funding_status: :unfunded)
        render json: job, serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
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
                      :scheduled_start_at, :scheduled_end_at, :price_cents, :hourly_rate_cents, :hours_per_day, :days, :pay_basis,
                      :address, :city, :state, :zip_code, :country, :latitude, :longitude,
                      :skill_class, :trade_type, :minimum_years_experience, :notes, :go_live_at, :start_mode,
                      :require_background_check, :require_identity_verification, :minimum_verified_references, :require_insurance_verification,
                      :rolling_start_rule_type, :rolling_start_exact_start_at, :rolling_start_days_after_acceptance,
                      :rolling_start_weekday, :rolling_start_weekday_time,
                      :weekend_work_policy, :saturday_work_policy, :sunday_work_policy,
                      :saturday_multiplier, :sunday_multiplier,
                      :weekend_requires_company_approval, :weekend_requires_technician_acceptance,
                      :premium_combination_rule,
                      :overtime_enabled, :daily_overtime_threshold_hours, :weekly_overtime_threshold_hours, :overtime_multiplier,
                      :hard_deadline_at, :job_timezone,
                      :potential_full_time, :schedule_flexibility,
                      standard_work_days: [],
                      standard_day_shifts: {},
                      weekend_day_shifts: {},
                      potential_full_time_details: {})
      end

      # Posting should make the job live immediately.
      # Any publish event (create as open, or draft -> open) anchors tier visibility at current time.
      def set_go_live_at_for_post!(job)
        return unless job.status.to_s == "open"
        return unless job.new_record? || job.will_save_change_to_status? || job.will_save_change_to_go_live_at?

        job.go_live_at = Time.current
      end

      def can_manage_job?(job)
        return true if @current_user&.admin?
        @current_user&.company? && job.company_profile_id == @current_user.company_profile&.id
      end

      UPDATABLE_STATUSES = %w[open pending_funding].freeze

      def disallowed_status_change_error(job, incoming)
        return nil unless incoming.key?("status") || incoming.key?(:status)

        requested = incoming[:status].presence || incoming["status"].presence
        return nil if requested.blank?
        return nil if requested.to_s == job.status.to_s
        return nil if UPDATABLE_STATUSES.include?(requested.to_s)

        action = case requested.to_s
                 when "finished", "completed" then 'Use "Mark Complete" or "End Assignment" instead.'
                 when "reserved", "filled", "accepted" then "A technician must claim the job."
                 else "Use the dedicated job action instead."
                 end
        "Job status cannot be changed to \"#{requested}\" from this endpoint. #{action}"
      end

      def undeletable_reason(job)
        return 'Ended assignments are kept for payment and review records and cannot be deleted.' if job.terminated_early?
        return 'Completed jobs are kept for payment and review records and cannot be deleted.' if job.finished? || job.completed?
        return 'This job has time entries and cannot be deleted. End the assignment instead.' if job.time_entries.exists?
        if job.job_applications.where(status: :accepted).exists?
          return 'A technician has claimed this job. Deny the technician or end the assignment first.'
        end
        if job.job_payment_transactions.status_succeeded.exists?
          return 'This job has payment activity. Unpublish it to refund the company before removing it.'
        end
        if job_holds_funds?(job)
          return 'This job is funded. Unpublish it to refund the company before removing it.'
        end

        nil
      end

      def job_holds_funds?(job)
        JobLedger.for(job).net_funded_cents.positive?
      rescue JobLedger::MissingCommissionSnapshotError
        false
      end

      def render_paginated_jobs(jobs)
        page = params[:page].presence&.to_i
        per_page = (params[:per_page].presence || default_jobs_per_page).to_i.clamp(1, 100)

        if page.present? && page.positive?
          count_relation = jobs.except(:includes, :eager_load, :preload, :offset, :limit)
          total = count_relation.count
          total = total.values.sum if total.is_a?(Hash)
          records = jobs.offset((page - 1) * per_page).limit(per_page)
          serialized = ActiveModelSerializers::SerializableResource.new(
            records,
            each_serializer: JobSerializer,
            include: [:company_profile, { job_applications: { technician_profile: :user } }],
            scope: @current_user,
            scope_name: :current_user
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

      def optional_to_required_change_after_claim?(job, previous_weekend_policy)
        return false if @current_user&.admin?
        return false unless previous_weekend_policy.to_s == "optional" && job.weekend_work_policy.to_s == "required"

        job.job_applications.where(status: :accepted).exists?
      end

      def lowering_multiplier_with_locked_entries?(job, previous_sat_multiplier, previous_sun_multiplier)
        return false unless job.time_entries.where(status: [:approved, :paid]).exists?

        sat_changed = previous_sat_multiplier.present? && job.saturday_multiplier.present? && job.saturday_multiplier.to_d < previous_sat_multiplier.to_d
        sun_changed = previous_sun_multiplier.present? && job.sunday_multiplier.present? && job.sunday_multiplier.to_d < previous_sun_multiplier.to_d
        sat_changed || sun_changed
      end

      def assign_and_validate_trade_type!(job:, company_profile:)
        company_trades = Array(company_profile&.effective_service_trades).compact.uniq
        requested_trade = TradeCatalog.normalized_label(job.trade_type)

        if company_trades.length == 1
          required_trade = company_trades.first
          if requested_trade.present? && requested_trade != required_trade
            return "This company is configured for #{required_trade} jobs only."
          end
          job.trade_type = required_trade
          return nil
        end

        if company_trades.length > 1
          if requested_trade.blank?
            return "Select a trade for this job. This company has multiple service trades configured."
          end
          unless company_trades.include?(requested_trade)
            return "Selected trade is not part of this company's configured service trades."
          end
          job.trade_type = requested_trade
          return nil
        end

        if requested_trade.blank?
          return nil
        end

        job.trade_type = requested_trade
        nil
      end

      def assign_and_validate_skill_class!(job, required:)
        return nil unless required || job.will_save_change_to_skill_class?

        raw = job.skill_class
        normalized = TechnicianClassCatalog.normalized_label(raw)
        if required && raw.to_s.strip.blank?
          return "Select a class (Apprentice, Journeyman, or Master)."
        end
        if raw.to_s.strip.present? && normalized.blank?
          return "Class must be Apprentice, Journeyman, or Master."
        end
        job.skill_class = normalized if normalized.present?
        nil
      end
    end
  end
end 
