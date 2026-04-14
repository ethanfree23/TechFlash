# frozen_string_literal: true

module Api
  module V1
    class FavoriteTechniciansController < ApplicationController
      before_action :authenticate_user
      before_action :require_company
      before_action :set_company_profile

      def index
        ids = @company_profile.favorite_technician_entries.pluck(:technician_profile_id)
        render json: { technician_profile_ids: ids }, status: :ok
      end

      def create
        tech = TechnicianProfile.find(params[:technician_profile_id])
        @company_profile.favorite_technician_entries.find_or_create_by!(technician_profile: tech)
        head :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Technician not found' }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def destroy
        entry = @company_profile.favorite_technician_entries.find_by!(technician_profile_id: params[:id])
        entry.destroy!
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Favorite not found' }, status: :not_found
      end

      private

      def set_company_profile
        @company_profile = @current_user.company_profile
        return if @company_profile

        @company_profile = CompanyProfile.create!(user_id: @current_user.id)
      end
    end
  end
end
