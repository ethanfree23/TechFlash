# frozen_string_literal: true

module Api
  module V1
    class PaymentsController < ApplicationController
      before_action :authenticate_user

      # Create a PaymentIntent for the company to pay when accepting a job
      def create_intent
        job = Job.find(params[:job_id])
        unless @current_user.company? && job.company_profile_id == @current_user.company_profile&.id
          return render json: { error: 'Access denied' }, status: :forbidden
        end
        unless job.reserved?
          return render json: { error: 'Job must be claimed before payment' }, status: :unprocessable_entity
        end
        if job.job_amount_cents <= 0
          return render json: { error: 'Job has no price set' }, status: :unprocessable_entity
        end
        if job.payments.held.any? || job.payments.released.any?
          return render json: { error: 'Job already paid' }, status: :unprocessable_entity
        end

        if Stripe.api_key.blank?
          return render json: { error: 'Payments not configured' }, status: :service_unavailable
        end

        customer_id = StripeCustomerService.ensure_customer_id!(@current_user)
        intent_params = {
          amount: job.company_charge_cents,
          currency: 'usd',
          customer: customer_id,
          metadata: { job_id: job.id.to_s },
          automatic_payment_methods: { enabled: true }
        }

        intent = Stripe::PaymentIntent.create(intent_params)
        render json: { client_secret: intent.client_secret, payment_intent_id: intent.id }, status: :ok
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end
    end
  end
end
