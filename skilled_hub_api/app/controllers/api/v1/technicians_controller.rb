module Api
  module V1
    class TechniciansController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician, only: [:profile]
      
      def index
        technicians = TechnicianProfile.all
        render json: technicians, each_serializer: TechnicianProfileSerializer, status: :ok
      end
      
      def show
        technician = TechnicianProfile.find(params[:id])
        render json: technician, serializer: TechnicianProfileDetailSerializer, include: [:user, :ratings_received], status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Technician not found" }, status: :not_found
      end

      def create
        technician = TechnicianProfile.new(technician_params)
        if technician.save
          render json: technician, serializer: TechnicianProfileSerializer, status: :created
        else
          render json: { errors: technician.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        technician = TechnicianProfile.find(params[:id])
        if technician.update(technician_params)
          render json: technician, serializer: TechnicianProfileSerializer, status: :ok
        else
          render json: { errors: technician.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Technician not found" }, status: :not_found
      end

      def destroy
        technician = TechnicianProfile.find(params[:id])
        technician.destroy
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Technician not found" }, status: :not_found
      end

      def profile
        profile = @current_user.technician_profile
        if profile
          render json: profile, serializer: TechnicianProfileSerializer, status: :ok
        else
          render json: { error: "Technician profile not found" }, status: :not_found
        end
      end

      private

      def technician_params
        params.permit(:specialty, :experience_years, :user_id)
      end
    end
  end
end 