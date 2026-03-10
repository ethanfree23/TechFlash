module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate_user, only: [:show]
      
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
        user = User.new(user_params)
        if user.save
          UserMailer.welcome_email(user).deliver_later
          token = JWT.encode({ user_id: user.id }, Rails.application.secret_key_base)
          render json: { token: token, user: UserSerializer.new(user).as_json }, status: :created
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def user_params
        params.permit(:email, :password, :password_confirmation, :role)
      end
    end
  end
end 