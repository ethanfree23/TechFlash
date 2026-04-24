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
        # Registration only allows technician or company; admin is created manually
        permitted_role = %w[technician company].include?(params[:role].to_s) ? params[:role] : 'technician'
        user = User.new(user_params.merge(role: permitted_role))
        if user.save
          if user.company?
            profile = CompanyProfile.create!(user: user)
            user.update_column(:company_profile_id, profile.id)
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
        params.permit(:email, :password, :password_confirmation, :role)
      end

      def update_me_params
        p = params.permit(:email, :password, :password_confirmation).to_h
        p.except!(:password, :password_confirmation) if p[:password].blank?
        p
      end
    end
  end
end 