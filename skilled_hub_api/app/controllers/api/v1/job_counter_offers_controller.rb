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

      def create
        job = Job.find(params[:job_id])
        return render json: { error: "Only technicians can create counter offers" }, status: :forbidden unless @current_user.technician?
        return render json: { error: "Job is no longer available" }, status: :unprocessable_entity unless job.open?

        technician_profile = @current_user.technician_profile
        return render json: { error: "Technician profile not found" }, status: :unprocessable_entity if technician_profile.blank?

        offer = job.job_counter_offers.create!(
          company_profile: job.company_profile,
          technician_profile: technician_profile,
          created_by_role: :technician,
          status: :pending_company,
          proposed_hourly_rate_cents: params[:proposed_hourly_rate_cents],
          proposed_hours_per_day: params[:proposed_hours_per_day],
          proposed_days: params[:proposed_days],
          proposed_start_at: params[:proposed_start_at],
          proposed_end_at: params[:proposed_end_at],
          proposed_start_mode: params[:proposed_start_mode] || "hard_start"
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
        return render json: { error: "Offer can no longer be accepted" }, status: :unprocessable_entity unless offer.pending_company? || offer.pending_technician?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        claim_result = Jobs::ClaimJobService.call(job: offer.job, technician_user: offer.technician_profile.user, offer: offer)
        if claim_result[:error]
          return render json: {
            error: claim_result[:error],
            payment_adjustment_required: claim_result[:payment_adjustment_required] || false,
            client_secret: claim_result[:client_secret]
          }, status: (claim_result[:status] || :unprocessable_entity)
        end

        offer.update!(status: :accepted, responded_at: Time.current)
        offer.job.job_counter_offers.where(status: [:pending_company, :pending_technician]).where.not(id: offer.id).update_all(status: JobCounterOffer.statuses[:superseded], responded_at: Time.current)
        MailDelivery.safe_deliver { UserMailer.job_counter_offer_accepted_email(offer).deliver_now }

        render json: claim_result[:job], serializer: JobSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Counter offer not found" }, status: :not_found
      end

      def decline
        offer = JobCounterOffer.find(params[:id])
        return render json: { error: "Offer can no longer be declined" }, status: :unprocessable_entity unless offer.pending_company? || offer.pending_technician?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        offer.update!(status: :declined, responded_at: Time.current)
        MailDelivery.safe_deliver { UserMailer.job_counter_offer_declined_email(offer).deliver_now }
        render json: offer, serializer: JobCounterOfferSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Counter offer not found" }, status: :not_found
      end

      def counter
        offer = JobCounterOffer.find(params[:id])
        return render json: { error: "Offer can no longer be countered" }, status: :unprocessable_entity unless offer.pending_company? || offer.pending_technician?
        return render json: { error: "Access denied" }, status: :forbidden unless can_respond_to_offer?(offer)

        next_status = @current_user.company? ? :pending_technician : :pending_company
        next_role = @current_user.company? ? :company : :technician

        new_offer = JobCounterOffer.create!(
          job: offer.job,
          company_profile: offer.company_profile,
          technician_profile: offer.technician_profile,
          parent_offer: offer,
          created_by_role: next_role,
          status: next_status,
          proposed_hourly_rate_cents: params[:proposed_hourly_rate_cents],
          proposed_hours_per_day: params[:proposed_hours_per_day],
          proposed_days: params[:proposed_days],
          proposed_start_at: params[:proposed_start_at],
          proposed_end_at: params[:proposed_end_at],
          proposed_start_mode: params[:proposed_start_mode] || "hard_start"
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
