# frozen_string_literal: true

module Api
  module V1
    class MembershipsController < ApplicationController
      before_action :authenticate_user

      def show
        profile = membership_profile
        return render json: { error: "Membership profile not found" }, status: :not_found if profile.blank?

        render json: membership_payload(profile), status: :ok
      end

      def update
        profile = membership_profile
        return render json: { error: "Membership profile not found" }, status: :not_found if profile.blank?

        requested_level = params[:membership_level].to_s.downcase
        unless MembershipPolicy.level_valid?(requested_level)
          return render json: { error: "membership_level must be basic, pro, or premium" }, status: :unprocessable_entity
        end
        level = requested_level

        if level == "basic"
          MembershipSubscriptionService.cancel_for_basic!(@current_user)
          profile.update!(
            membership_level: "basic",
            membership_status: "active",
            stripe_membership_subscription_id: nil,
            membership_current_period_end_at: nil
          )
          return render json: membership_payload(profile.reload), status: :ok
        end

        result = MembershipSubscriptionService.create_checkout_session!(
          user: @current_user,
          membership_level: level,
          success_url: params[:success_url].presence || default_success_url,
          cancel_url: params[:cancel_url].presence || default_cancel_url
        )

        render json: { checkout: result, pending_membership_level: level }, status: :ok
      rescue MembershipSubscriptionService::Error => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def membership_profile
        if @current_user.company?
          @current_user.company_profile
        elsif @current_user.technician?
          @current_user.technician_profile
        end
      end

      def membership_payload(profile)
        monthly_fee_cents =
          if @current_user.company?
            MembershipPolicy.company_monthly_fee_cents(profile)
          else
            MembershipPolicy.technician_monthly_fee_cents(profile)
          end

        commission_percent =
          if @current_user.company?
            MembershipPolicy.company_commission_percent(profile)
          else
            MembershipPolicy.technician_commission_percent(profile)
          end

        {
          membership_level: MembershipPolicy.normalized_level(profile.membership_level),
          monthly_fee_cents: monthly_fee_cents,
          commission_percent: commission_percent,
          membership_fee_waived: profile.membership_fee_waived,
          membership_fee_override_cents: profile.membership_fee_override_cents,
          commission_override_percent: profile.commission_override_percent,
          membership_status: profile.membership_status,
          membership_current_period_end_at: profile.membership_current_period_end_at
        }
      end

      def default_success_url
        base = ENV.fetch("FRONTEND_URL", "http://localhost:5173").chomp("/")
        "#{base}/settings?membership=success"
      end

      def default_cancel_url
        base = ENV.fetch("FRONTEND_URL", "http://localhost:5173").chomp("/")
        "#{base}/settings?membership=cancel"
      end
    end
  end
end
