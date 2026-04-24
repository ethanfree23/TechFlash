module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate_user, only: [:show, :update_me]

      def update_me
        if @current_user.update(update_me_params)
          render json: { user: UserSerializer.new(@current_user).as_json }, status: :ok
        else
          render json: { errors: @current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def index
        users = User.all
        render json: users, each_serializer: UserSerializer, status: :ok
      end
      
      def show
        user = User.find(params[:id])
        render json: user, serializer: UserSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "User not found" }, status: :not_found
      end

      def create
        email = params[:email].to_s.strip.downcase
        if blocked_signup_email?(email) || params[:honeypot].to_s.present?
          block_marketing_email!(email)
          return render json: { error: "Registration is unavailable for this email." }, status: :forbidden
        end

        # Registration only allows technician or company; admin is created manually
        permitted_role = %w[technician company].include?(params[:role].to_s) ? params[:role] : 'technician'
        membership_level = MembershipPolicy.normalized_level(params[:membership_tier] || params[:membership_level])
        unless MembershipPolicy.level_valid?(membership_level)
          return render json: { error: "membership_tier must be basic, pro, or premium" }, status: :unprocessable_entity
        end
        unless payment_valid_for_tier?(membership_level)
          return render json: { error: "Valid payment is required for selected membership tier." }, status: :unprocessable_entity
        end

        user = User.new(user_params.merge(email: email, role: permitted_role))
        if user.save
          if user.company?
            profile = CompanyProfile.create!(user: user, membership_level: membership_level)
            user.update_column(:company_profile_id, profile.id)
          elsif user.technician?
            TechnicianProfile.create!(
              user: user,
              trade_type: 'General',
              experience_years: 0,
              availability: 'Full-time',
              membership_level: membership_level
            )
          end
          MailDelivery.safe_deliver { UserMailer.welcome_email(user).deliver_now }
          token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base)
          render json: { token: token, user: UserSerializer.new(user).as_json }, status: :created
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def user_params
        params.permit(:email, :password, :password_confirmation, :role, :membership_tier, :membership_level, :signup_payment_intent_id, :honeypot)
      end

      def update_me_params
        p = params.permit(:email, :password, :password_confirmation).to_h
        p.except!(:password, :password_confirmation) if p[:password].blank?
        p
      end

      def blocked_signup_email?(email)
        MarketingLead.where(email: email, honeypot_triggered: true).exists?
      end

      def block_marketing_email!(email)
        return if email.blank?

        lead = MarketingLead.find_or_initialize_by(email: email)
        lead.honeypot_triggered = true
        lead.blocked_at ||= Time.current
        lead.save(validate: false)
      end

      def payment_valid_for_tier?(membership_level)
        return true if membership_level == "basic"

        intent_id = params[:signup_payment_intent_id].to_s
        return false if intent_id.blank? || Stripe.api_key.blank?

        intent = Stripe::PaymentIntent.retrieve(intent_id)
        return false unless intent.status == "succeeded"

        intent.metadata["membership_tier"] == membership_level
      rescue Stripe::StripeError
        false
      end
    end
  end
end 