# frozen_string_literal: true

module Api
  module V1
    class SavedJobSearchesController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician
      before_action :set_technician_profile

      def index
        searches = @technician_profile.saved_job_searches.order(updated_at: :desc)
        render json: searches.as_json(only: %i[id keyword location skill_class created_at updated_at]), status: :ok
      end

      def create
        attrs = search_key_params
        search = @technician_profile.saved_job_searches.find_by(
          keyword: attrs[:keyword],
          location: attrs[:location],
          skill_class: attrs[:skill_class]
        )
        if search
          search.touch
        else
          search = @technician_profile.saved_job_searches.create!(attrs)
        end
        render json: search.as_json(only: %i[id keyword location skill_class created_at updated_at]), status: :created
      rescue ActiveRecord::RecordNotUnique
        search = @technician_profile.saved_job_searches.find_by!(
          keyword: attrs[:keyword],
          location: attrs[:location],
          skill_class: attrs[:skill_class]
        )
        search.touch
        render json: search.as_json(only: %i[id keyword location skill_class created_at updated_at]), status: :created
      end

      def destroy
        search = @technician_profile.saved_job_searches.find(params[:id])
        search.destroy!
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Saved search not found' }, status: :not_found
      end

      private

      def set_technician_profile
        @technician_profile = @current_user.technician_profile
        return if @technician_profile

        render json: { error: 'Technician profile required' }, status: :unprocessable_entity
      end

      def search_key_params
        {
          keyword: params[:keyword].to_s.strip.presence,
          location: params[:location].to_s.strip.presence,
          skill_class: params[:skill_class].to_s.strip.presence
        }
      end
    end
  end
end
