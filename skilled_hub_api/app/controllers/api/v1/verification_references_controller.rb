module Api
  module V1
    class VerificationReferencesController < ApplicationController
      before_action :authenticate_user, except: [:respond]
      before_action :require_technician, only: [:index, :create]

      def index
        refs = VerificationReference.where(technician_user_id: @current_user.id).order(created_at: :desc)
        render json: refs, each_serializer: VerificationReferenceSerializer, status: :ok
      end

      def create
        ref = VerificationReference.new(reference_params)
        ref.technician_user_id = @current_user.id
        ref.status = :requested
        ref.requested_at = Time.current

        if ref.save
          VerificationEventNotifier.reference_request_created(ref)
          VerificationAuditLog.record!(
            user: @current_user,
            actor_user: @current_user,
            entity: ref,
            action: "reference_requested",
            details: { email: ref.email, full_name: ref.full_name }
          )
          render json: {
            reference: VerificationReferenceSerializer.new(ref).as_json,
            response_link: reference_response_link(ref.request_token)
          }, status: :created
        else
          render json: { errors: ref.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotUnique
        render json: { errors: ["Email or phone has already been used for another reference"] }, status: :unprocessable_entity
      end

      # Public endpoint called by emailed reference link form.
      def respond
        ref = VerificationReference.find_by(request_token: params[:token].to_s)
        return render json: { error: "Reference request not found" }, status: :not_found if ref.blank?
        return render json: { error: "Reference already submitted" }, status: :unprocessable_entity if ref.responded? || ref.approved? || ref.rejected?

        answers = params.permit(:would_rehire, :reliability, :quality, :communication, :safety, :comments).to_h
        ref.update!(
          status: :responded,
          responded_at: Time.current,
          answers: answers
        )
        technician = ref.technician_user
        VerificationAuditLog.record!(
          user: technician,
          actor_user: technician,
          entity: ref,
          action: "reference_submitted",
          details: { reference_id: ref.id }
        )
        VerificationProfile.for_user!(technician).update!(references_status: :pending)

        render json: { message: "Reference submitted successfully." }, status: :ok
      end

      private

      def reference_params
        params.permit(:full_name, :email, :phone, :company_name, :relationship)
      end

      def reference_response_link(token)
        base = ENV.fetch("FRONTEND_URL", "http://localhost:5173")
        "#{base}/references/respond/#{token}"
      end
    end
  end
end
