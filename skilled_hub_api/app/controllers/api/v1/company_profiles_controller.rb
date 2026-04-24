module Api
  module V1
    class CompanyProfilesController < ApplicationController
      before_action :authenticate_user
      before_action :require_company, only: [:update]
      
      def index
        company_profiles = CompanyProfile.all
        render json: company_profiles, each_serializer: CompanyProfileSerializer, status: :ok
      end
      
      def show
        company_profile = CompanyProfile.find(params[:id])
        # Companies can only view their own profile (for "My Reviews"); technicians can view any company
        if @current_user&.company? && company_profile.id != @current_user.company_profile&.id
          return render json: { error: "You can only view your own company profile" }, status: :forbidden
        end
        render json: company_profile, serializer: CompanyProfileDetailSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Company profile not found" }, status: :not_found
      end

      def create
        company_profile = CompanyProfile.new(company_profile_params)
        if company_profile.save
          render json: company_profile, serializer: CompanyProfileSerializer, status: :created
        else
          render json: { errors: company_profile.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        company_profile = CompanyProfile.find(params[:id])
        return render json: { error: 'Access denied' }, status: :forbidden unless company_profile.id == @current_user.company_profile&.id
        attrs = company_profile_params.to_h
        company_profile.avatar.attach(params[:avatar]) if params[:avatar].present?
        if company_profile.update(attrs.except(:avatar))
          render json: company_profile, serializer: CompanyProfileSerializer, status: :ok
        else
          render json: { errors: company_profile.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Company profile not found" }, status: :not_found
      end

      def destroy
        company_profile = CompanyProfile.find(params[:id])
        company_profile.destroy
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Company profile not found" }, status: :not_found
      end

      def profile
        profile = @current_user.company_profile
        profile ||= CompanyProfile.create!(user_id: @current_user.id)
        if @current_user.company_profile_id != profile.id
          @current_user.update_column(:company_profile_id, profile.id)
        end
        render json: profile, serializer: CompanyProfileSerializer, status: :ok
      end

      private

      def company_profile_params
        params.permit(
          :company_name, :industry, :location, :bio, :user_id,
          :phone, :website_url, :facebook_url, :instagram_url, :linkedin_url,
          service_cities: []
        )
      end
    end
  end
end 