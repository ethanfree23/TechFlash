module Api
  module V1
    class CompanyProfilesController < ApplicationController
      before_action :authenticate_user
      before_action :require_company, only: [:update]
      before_action :require_admin, only: [:merge]
      
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

      # POST /api/v1/company_profiles/:id/merge
      # Admin only: merges the source company profile into a target company profile.
      def merge
        current = CompanyProfile.find(params[:id])
        selected = CompanyProfile.find(params[:target_company_profile_id])
        merge_direction = params[:merge_direction].to_s
        source, target =
          if merge_direction == "into_current"
            [selected, current]
          else
            [current, selected]
          end
        return render json: { error: "Target must be different from source" }, status: :unprocessable_entity if source.id == target.id

        now = Time.current
        ActiveRecord::Base.transaction do
          User.where(company_profile_id: source.id).update_all(company_profile_id: target.id, updated_at: now)
          Job.where(company_profile_id: source.id).update_all(company_profile_id: target.id, updated_at: now)
          Conversation.where(company_profile_id: source.id).update_all(company_profile_id: target.id, updated_at: now)
          Rating.where(reviewee_type: "CompanyProfile", reviewee_id: source.id).update_all(reviewee_id: target.id, updated_at: now)
          CrmLead.where(linked_company_profile_id: source.id).update_all(linked_company_profile_id: target.id, updated_at: now)

          source.favorite_technician_entries.find_each do |fav|
            FavoriteTechnician.find_or_create_by!(
              company_profile_id: target.id,
              technician_profile_id: fav.technician_profile_id
            )
          end
          source.favorite_technician_entries.delete_all

          source.destroy!
        end

        render json: {
          message: "Company profile merged",
          source_company_profile_id: source.id,
          target_company_profile_id: target.id,
          merge_direction: merge_direction.presence || "into_target"
        }, status: :ok
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