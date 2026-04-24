# frozen_string_literal: true

module Api
  module V1
    class SignupPaymentIntentsController < ApplicationController
      TIER_PRICES_CENTS = {
        "basic" => 0,
        "pro" => 1900,
        "premium" => 4900
      }.freeze

      def create
        tier = MembershipPolicy.normalized_level(params[:membership_tier])
        amount = TIER_PRICES_CENTS.fetch(tier, 0)
        return render json: { error: "Selected tier does not require payment" }, status: :unprocessable_entity if amount <= 0
        return render json: { error: "Payments not configured" }, status: :service_unavailable if Stripe.api_key.blank?

        intent = Stripe::PaymentIntent.create(
          amount: amount,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            signup_email: params[:email].to_s.strip.downcase,
            signup_role: params[:role].to_s,
            membership_tier: tier,
            flow: "signup"
          }
        )

        render json: { client_secret: intent.client_secret, payment_intent_id: intent.id }, status: :ok
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end
    end
  end
end
