# frozen_string_literal: true

module Api
  module V1
    class GhlWebhooksController < ActionController::API
      def create
        unless GhlWebhookAuthenticator.authorized?(request)
          return head :unauthorized
        end

        result = GhlTechnicianOnboardingService.call(webhook_payload)
        render json: result.body, status: result.http_status
      end

      private

      def webhook_payload
        params.permit(
          :ghl_contact_id,
          :ghl_location_id,
          :ghl_conversation_id,
          :idempotency_key,
          :phone,
          :email,
          :first_name,
          :last_name,
          :tf_intake_contact_info,
          :tf_intake_references
        ).to_h
      end
    end
  end
end
