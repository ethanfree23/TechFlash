# frozen_string_literal: true

module Api
  module V1
    class SettingsController < ApplicationController
      before_action :authenticate_user

      # Company: list saved cards and bank accounts
      def payment_methods
        unless @current_user.company?
          return render json: { error: "Company only" }, status: :forbidden
        end

        if Stripe.api_key.blank?
          return render json: { error: "Payments not configured" }, status: :service_unavailable
        end
        mode_error = StripeModeGuard.error_message
        if mode_error
          return render json: { error: mode_error }, status: :service_unavailable
        end

        payload = CompanyPaymentMethodsService.list_for(@current_user)
        render json: payload, status: :ok
      rescue CompanyPaymentMethodsService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      # Company: create SetupIntent to add payment method (card or ACH/us_bank_account)
      def create_setup_intent
        unless @current_user.company?
          return render json: { error: 'Company only' }, status: :forbidden
        end

        if Stripe.api_key.blank?
          return render json: { error: 'Payments not configured' }, status: :service_unavailable
        end
        mode_error = StripeModeGuard.error_message
        if mode_error
          return render json: { error: mode_error }, status: :service_unavailable
        end

        payment_method_type = params[:payment_method_type].presence || params[:type].presence || "card"
        if payment_method_type.to_s == "us_bank_account" && !AchAccess.allowed?(@current_user.company_profile)
          return render json: {
            error: AchAccess::USER_SAFE_MESSAGE,
            code: "ach_disabled"
          }, status: :forbidden
        end

        payload = CompanyPaymentMethodsService.create_setup_intent!(
          @current_user,
          payment_method_type: payment_method_type,
          ip_address: request.remote_ip,
          user_agent: request.user_agent
        )
        render json: payload, status: :ok
      rescue CompanyPaymentMethodsService::Error => e
        status = e.message.to_s.include?("not enabled") ? :forbidden : :unprocessable_entity
        render json: { error: e.message, code: (status == :forbidden ? "ach_disabled" : nil) }.compact, status: status
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def set_default_payment_method
        unless @current_user.company?
          return render json: { error: "Company only" }, status: :forbidden
        end
        return render_payments_unavailable if payments_unavailable?

        pm = CompanyPaymentMethodsService.set_default!(
          @current_user,
          payment_method_id: params[:payment_method_id]
        )
        render json: { payment_method: pm, default_payment_method_id: pm[:id] }, status: :ok
      rescue CompanyPaymentMethodsService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def destroy_payment_method
        unless @current_user.company?
          return render json: { error: "Company only" }, status: :forbidden
        end
        return render_payments_unavailable if payments_unavailable?

        result = CompanyPaymentMethodsService.detach!(
          @current_user,
          payment_method_id: params[:id]
        )
        render json: result, status: :ok
      rescue CompanyPaymentMethodsService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      # Technician: create Stripe Connect account link for bank/payout onboarding
      def create_connect_account_link
        unless @current_user.technician?
          return render json: { error: 'Technician only' }, status: :forbidden
        end

        if Stripe.api_key.blank?
          return render json: { error: 'Payments not configured' }, status: :service_unavailable
        end
        mode_error = StripeModeGuard.error_message
        if mode_error
          return render json: { error: mode_error }, status: :service_unavailable
        end

        profile = @current_user.technician_profile
        profile ||= TechnicianProfile.create!(
          user: @current_user,
          trade_type: 'General',
          experience_years: 0,
          availability: 'Full-time'
        )

        # Create Express account if needed
        unless profile.stripe_account_id.present?
          account = Stripe::Account.create(
            type: 'express',
            email: @current_user.email,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true }
            }
          )
          profile.update!(stripe_account_id: account.id)
        end
        StripeConnectAccountService.sync!(profile)

        base_url = params[:base_url].presence || 'http://localhost:5173'
        return_url = "#{base_url}/settings?connect=return"
        refresh_url = "#{base_url}/settings?connect=refresh"

        link = Stripe::AccountLink.create(
          account: profile.stripe_account_id,
          refresh_url: refresh_url,
          return_url: return_url,
          type: 'account_onboarding'
        )
        render json: {
          url: link.url,
          stripe_payout_ready: StripeConnectAccountService.payout_ready?(profile.reload),
          stripe_charges_enabled: profile.stripe_charges_enabled,
          stripe_payouts_enabled: profile.stripe_payouts_enabled,
          stripe_details_submitted: profile.stripe_details_submitted
        }, status: :ok
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def payments_unavailable?
        return true if Stripe.api_key.blank?
        return true if StripeModeGuard.error_message.present?

        false
      end

      def render_payments_unavailable
        mode_error = StripeModeGuard.error_message
        render json: { error: mode_error.presence || "Payments not configured" }, status: :service_unavailable
      end
    end
  end
end
