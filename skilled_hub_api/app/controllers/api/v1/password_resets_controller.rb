# frozen_string_literal: true

module Api
  module V1
    class PasswordResetsController < ApplicationController
      # POST /api/v1/password_resets { email }
      def create
        email = params[:email].to_s.strip.downcase
        user = User.find_by('LOWER(email) = ?', email) if email.present?
        if user.present?
          user.generate_password_reset_token!
          MailDelivery.safe_deliver do
            UserMailer.password_reset_instructions(user, reason: :self_service).deliver_now
          end
        end
        head :no_content
      end

      # PATCH /api/v1/password_resets { token, password, password_confirmation }
      def update
        token = params[:token].to_s
        if token.blank?
          return render json: { errors: ['Reset link is invalid or expired'] }, status: :unprocessable_entity
        end

        user = User.find_by(password_reset_token: token)
        unless user&.password_reset_token_active?
          return render json: { errors: ['Reset link is invalid or expired'] }, status: :unprocessable_entity
        end

        password = params[:password].to_s
        unless PasswordStrength.valid?(password)
          return render json: { errors: [PasswordStrength::REQUIREMENT_TEXT] }, status: :unprocessable_entity
        end

        user.password = password
        user.password_confirmation = params[:password_confirmation]
        if user.save
          user.clear_password_reset_token!
          UserLoginEvent.create!(user_id: user.id)
          token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base, "HS256")
          render json: {
            message: 'Password updated',
            role: user.role,
            token: token,
            user: UserSerializer.new(user).as_json
          }, status: :ok
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end
    end
  end
end
