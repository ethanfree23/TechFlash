module Api
  module V1
    class SessionsController < ApplicationController
      def create
        email = params[:email].to_s.strip
        password = params[:password].to_s
        user = if email.present?
                 User.where("LOWER(email) = ?", email.downcase).first
               end
        if user&.authenticate(password)
          UserLoginEvent.create!(user_id: user.id)
          token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base, "HS256")
          user_json = UserSerializer.new(user).as_json
          render json: { token: token, user: user_json }, status: :ok
        else
          render json: { error: "Invalid email or password" }, status: :unauthorized
        end
      rescue => e
        Rails.logger.error "Login error: #{e.class} - #{e.message}\n#{e.backtrace.first(5).join("\n")}"
        render json: {
          error: "Login failed",
          message: (Rails.env.development? ? e.message : nil)
        }, status: :internal_server_error
      end
    end
  end
end
  