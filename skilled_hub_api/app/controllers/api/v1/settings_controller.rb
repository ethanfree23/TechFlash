# frozen_string_literal: true

module Api
  module V1
    class SettingsController < ApplicationController
      before_action :authenticate_user

      # Company: create SetupIntent to add payment method (card)
      def create_setup_intent
        unless @current_user.company?
          return render json: { error: 'Company only' }, status: :forbidden
        end

        if Stripe.api_key.blank?
          return render json: { error: 'Payments not configured' }, status: :service_unavailable
        end

        customer_id = StripeCustomerService.ensure_customer_id!(@current_user)

        intent = Stripe::SetupIntent.create(
          customer: customer_id,
          payment_method_types: ['card'],
          usage: 'off_session'
        )
        render json: { client_secret: intent.client_secret }, status: :ok
      rescue Stripe::StripeError => e
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

        base_url = params[:base_url].presence || 'http://localhost:5173'
        return_url = "#{base_url}/settings?connect=return"
        refresh_url = "#{base_url}/settings?connect=refresh"

        link = Stripe::AccountLink.create(
          account: profile.stripe_account_id,
          refresh_url: refresh_url,
          return_url: return_url,
          type: 'account_onboarding'
        )
        render json: { url: link.url }, status: :ok
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end
    end
  end
end
