module Api
  module V1
    class JobCounterOffersController < ApplicationController
      before_action :authenticate_user

      def index
        job = Job.find(params[:job_id])
        return render json: { error: "Access denied" }, status: :forbidden unless can_access_job?(job)

        offers = job.job_counter_offers.includes(:technician_profile, :company_profile).latest_first
        render json: offers, each_serializer: JobCounterOfferSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end

      # A counter offer can propose compensation changes (as before), an alternate schedule,
      # or both. Passing `schedule_option` makes TechFlash compute the proposed dates
      # server-side from the technician's real conflict rather than trusting client dates.
      def create
        job = Job.find(params[:job_id])
        return render json: { error: "Only technicians can create counter offers" }, status: :forbidden unless @current_user.technician?
        return render json: { error: "Job is no longer available" }, status: :unprocessable_entity unless job.available_for_claim?

        technician_profile = @current_user.technician_profile
        return render json: { error: "Technician profile not found" }, status: :unprocessable_entity if technician_profile.blank?

        attributes = base_offer_attributes
        if params[:schedule_option].present?
          proposal = Schedule::ProposalBuilder.call(
            job: job,
            technician_profile: technician_profile,
            schedule_option: params[:schedule_option]
          )
          return render json: { error: proposal.error }, status: :unprocessable_entity unless proposal.ok?

          attributes = attributes.merge(proposal.attributes)
          attributes[:proposal_kind] = :compensation_and_schedule if compensation_requested?
        end

        offer = job.job_counter_offers.create!(
          attributes.merge(
            company_profile: job.company_profile,
            technician_profile: technician_profile,
            created_by_role: :technician,
            status: :pending_company
          )
        )

        MailDelivery.safe_deliver { UserMailer.job_counter_offer_received_email(offer).deliver_now }
        render json: offer, serializer: JobCounterOfferSerializer, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def accept
        offer = JobCounterOffer.find(params[:id])
        return render json: { error: "Offer can no longer be accepted" }, status: :unprocessable_entity unless offer.pending?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        # Claim the accept so two simultaneous accepts cannot both run the claim/funding path.
        claimed = JobCounterOffer.where(id: offer.id, status: JobCounterOffer::PENDING_STATUSES)
                                 .update_all(status: JobCounterOffer.statuses[:accepted], responded_at: Time.current, updated_at: Time.current)
        return render json: { error: "Offer can no longer be accepted" }, status: :unprocessable_entity if claimed.zero?

        previous_status = offer.status
        offer.reload

        claim_result = Jobs::ClaimJobService.call(job: offer.job, technician_user: offer.technician_profile.user, offer: offer)
        if claim_result[:error]
          # Hand the turn back unless the proposal itself is no longer valid.
          if claim_result[:schedule_proposal_stale]
            offer.update!(
              status: :invalidated,
              invalidated_at: Time.current,
              invalidated_reason: "job_terms_changed",
              responded_at: Time.current
            )
          else
            offer.update!(status: previous_status, responded_at: nil)
          end
          return render json: {
            error: claim_result[:error],
            payment_adjustment_required: claim_result[:payment_adjustment_required] || false,
            client_secret: claim_result[:client_secret],
            schedule_proposal_stale: claim_result[:schedule_proposal_stale] || false
          }.compact, status: (claim_result[:status] || :unprocessable_entity)
        end

        offer.job.job_counter_offers.where(status: [:pending_company, :pending_technician]).where.not(id: offer.id).update_all(status: JobCounterOffer.statuses[:superseded], responded_at: Time.current)
        MailDelivery.safe_deliver { UserMailer.job_counter_offer_accepted_email(offer.reload).deliver_now }

        render json: claim_result[:job], serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Counter offer not found" }, status: :not_found
      end

      def decline
        offer = JobCounterOffer.find(params[:id])
        return render json: { error: "Offer can no longer be declined" }, status: :unprocessable_entity unless offer.pending?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        offer.update!(status: :declined, responded_at: Time.current)
        MailDelivery.safe_deliver { UserMailer.job_counter_offer_declined_email(offer).deliver_now }
        render json: offer, serializer: JobCounterOfferSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Counter offer not found" }, status: :not_found
      end

      def counter
        offer = JobCounterOffer.find(params[:id])
        return render json: { error: "Offer can no longer be countered" }, status: :unprocessable_entity unless offer.pending?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        next_status = @current_user.company? ? :pending_technician : :pending_company
        next_role = @current_user.company? ? :company : :technician

        new_offer = JobCounterOffer.create!(
          base_offer_attributes.merge(
            counter_schedule_attributes(offer),
            job: offer.job,
            company_profile: offer.company_profile,
            technician_profile: offer.technician_profile,
            parent_offer: offer,
            created_by_role: next_role,
            status: next_status
          )
        )

        offer.update!(status: :superseded, responded_at: Time.current)
        MailDelivery.safe_deliver { UserMailer.job_counter_offer_countered_email(new_offer).deliver_now }
        render json: new_offer, serializer: JobCounterOfferSerializer, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Counter offer not found" }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def base_offer_attributes
        {
          proposed_hourly_rate_cents: params[:proposed_hourly_rate_cents],
          proposed_hours_per_day: params[:proposed_hours_per_day],
          proposed_days: params[:proposed_days],
          proposed_start_at: params[:proposed_start_at],
          proposed_end_at: params[:proposed_end_at],
          proposed_start_mode: params[:proposed_start_mode] || "hard_start"
        }
      end

      def compensation_requested?
        params[:proposed_hourly_rate_cents].present? || params[:proposed_hours_per_day].present?
      end

      # Countering a schedule proposal keeps it a schedule negotiation and re-stamps the
      # signature so staleness is measured against the job's current terms. When the
      # responder supplies a different window, the working dates are recomputed from the
      # job's schedule rather than carried over from the parent offer.
      def counter_schedule_attributes(parent)
        return {} unless parent.schedule_proposal?

        attributes = {
          proposal_kind: compensation_requested? ? :compensation_and_schedule : :schedule,
          proposal_reason: parent.proposal_reason,
          schedule_option: parent.schedule_option,
          original_start_at: parent.original_start_at,
          original_end_at: parent.original_end_at,
          original_days: parent.original_days,
          proposed_working_dates: parent.proposed_working_dates_list,
          unavailable_working_dates: parent.unavailable_working_dates_list,
          conflicting_job_ids: parent.conflicting_job_ids_list,
          committed_through_at: parent.committed_through_at,
          full_duration_offered: parent.full_duration_offered,
          partial_duration: parent.partial_duration,
          schedule_signature: Schedule::ProposalSignature.for(parent.job)
        }

        window = recomputed_window(parent)
        return attributes.merge(proposed_days: parent.proposed_days) if window.blank?

        requested = parent.original_days.to_i
        attributes.merge(
          proposed_days: params[:proposed_days].presence || window.length,
          proposed_working_dates: window.map(&:to_s),
          unavailable_working_dates: parent.unavailable_working_dates_list,
          full_duration_offered: requested.positive? && window.length >= requested,
          partial_duration: requested.positive? && window.length < requested
        )
      end

      def recomputed_window(parent)
        start_at = parse_time(params[:proposed_start_at])
        end_at = parse_time(params[:proposed_end_at])
        return nil if start_at.blank? || end_at.blank?
        return nil if start_at == parent.proposed_start_at && end_at == parent.proposed_end_at

        Schedule::WorkingIntervalExpander.working_dates_between(parent.job, start_at, end_at).presence
      end

      def parse_time(raw)
        return nil if raw.blank?

        Time.zone.parse(raw.to_s)
      rescue ArgumentError
        nil
      end

      def can_access_job?(job)
        return true if @current_user.admin?
        return job.company_profile_id == @current_user.company_profile&.id if @current_user.company?
        return false unless @current_user.technician?

        @current_user.technician_profile.present?
      end

      def can_respond_to_offer?(offer)
        return true if @current_user.admin?
        return true if offer.pending_company? && @current_user.company? && @current_user.company_profile&.id == offer.company_profile_id
        return true if offer.pending_technician? && @current_user.technician? && @current_user.technician_profile&.id == offer.technician_profile_id

        false
      end
    end
  end
end
