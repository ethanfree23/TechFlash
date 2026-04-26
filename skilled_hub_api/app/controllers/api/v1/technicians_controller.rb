module Api
  module V1
    class TechniciansController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician, only: [:profile]
      before_action :require_admin, only: [:merge]
      
      def index
        technicians = TechnicianProfile.all
        render json: technicians, each_serializer: TechnicianProfileSerializer, status: :ok
      end
      
      def show
        technician = TechnicianProfile.find(params[:id])
        render json: technician, serializer: TechnicianProfileDetailSerializer, include: [:user, :documents, :ratings_received], status: :ok
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
        return render json: { error: 'Access denied' }, status: :forbidden unless technician.user_id == @current_user.id
        attrs = technician_params.to_h
        technician.avatar.attach(params[:avatar]) if params[:avatar].present?
        if technician.update(attrs.except(:avatar))
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

      # POST /api/v1/technicians/:id/merge
      # Admin only: merges the source technician profile into a target technician profile.
      def merge
        current = TechnicianProfile.find(params[:id])
        selected = TechnicianProfile.find(params[:target_technician_profile_id])
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
          JobApplication.where(technician_profile_id: source.id).update_all(technician_profile_id: target.id, updated_at: now)
          Conversation.where(technician_profile_id: source.id).update_all(technician_profile_id: target.id, updated_at: now)
          Rating.where(reviewee_type: "TechnicianProfile", reviewee_id: source.id).update_all(reviewee_id: target.id, updated_at: now)
          Document.where(uploadable_type: "TechnicianProfile", uploadable_id: source.id).update_all(uploadable_id: target.id, updated_at: now)

          source.favorite_technician_entries.find_each do |fav|
            FavoriteTechnician.find_or_create_by!(
              company_profile_id: fav.company_profile_id,
              technician_profile_id: target.id
            )
          end
          source.favorite_technician_entries.delete_all

          source.saved_job_searches.find_each do |saved|
            SavedJobSearch.find_or_create_by!(
              technician_profile_id: target.id,
              keyword: saved.keyword,
              location: saved.location,
              skill_class: saved.skill_class
            )
          end
          source.saved_job_searches.delete_all

          source.destroy!
        end

        render json: {
          message: "Technician profile merged",
          source_technician_profile_id: source.id,
          target_technician_profile_id: target.id,
          merge_direction: merge_direction.presence || "into_target"
        }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Technician profile not found" }, status: :not_found
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
        params.permit(:trade_type, :experience_years, :availability, :bio, :phone, :location, :user_id,
                     :address, :city, :state, :zip_code, :country, :background_verified)
      end
    end
  end
end 