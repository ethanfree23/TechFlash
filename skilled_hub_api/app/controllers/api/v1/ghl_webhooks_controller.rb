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

      def company_onboarding
        unless GhlWebhookAuthenticator.authorized?(request)
          return head :unauthorized
        end

        result = GhlCompanyOnboardingService.call(company_onboarding_payload)
        render json: result.body, status: result.http_status
      end

      def inbound_sms
        unless GhlWebhookAuthenticator.authorized?(request)
          return head :unauthorized
        end

        result = Ai::InboundSmsProcessor.call(inbound_sms_payload)
        render json: result.body, status: result.http_status
      end

      private

      def webhook_payload
        permitted = params.permit(
          :ghl_contact_id,
          :ghl_location_id,
          :ghl_conversation_id,
          :idempotency_key,
          :event,
          :phone,
          :email,
          :first_name,
          :last_name,
          :full_name,
          :zip_code,
          :postal_code,
          :zip,
          :primary_trade,
          :trade_type,
          :years_of_experience,
          :experience_years,
          :technician_level,
          :skill_class,
          :has_trade_credential,
          :trade_license_title,
          :trade_license_number,
          :trade_license_photo_url,
          :minimum_hourly_rate,
          :min_hourly_rate,
          :min_hourly_rate_cents,
          :travel_distance,
          :max_distance_miles,
          :tf_intake_contact_info,
          :tf_intake_references,
          :profile_photo_url,
          :message_attachments,
          :media_url,
          :attachments,
          :reference_1_name,
          :reference_1_company,
          :reference_1_phone,
          :reference_1_email,
          :reference_2_name,
          :reference_2_company,
          :reference_2_phone,
          :reference_2_email,
          :reference_3_name,
          :reference_3_company,
          :reference_3_phone,
          :reference_3_email,
          references: %i[full_name name company_name company phone email relationship],
          attachments: %i[url type filename],
          customData: [:attachments]
        ).to_h
        permitted["attachments"] = params[:attachments] if params.key?(:attachments)
        permitted
      end

      # Scalar keys only; the accepted list lives in GhlCompanyPayload::PERMITTED_KEYS.
      # trades_needed may also arrive as an array.
      def company_onboarding_payload
        params.permit(*GhlCompanyPayload::PERMITTED_KEYS, trades_needed: []).to_h
      end

      def inbound_sms_payload
        raw = request.request_parameters
        hash = raw.is_a?(Hash) && raw.present? ? raw : params.to_unsafe_h
        hash.deep_stringify_keys.except("controller", "action", "format")
      end
    end
  end
end
