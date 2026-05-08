module Api
  module V1
    module Admin
      class SimulatedTechnicianMarkersController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_marker, only: %i[update destroy]

        def index
          render json: { simulated_technician_markers: SimulatedTechnicianMarker.order(created_at: :desc) }, status: :ok
        end

        def create
          marker = SimulatedTechnicianMarker.new(marker_params)
          if marker.save
            render json: { simulated_technician_marker: marker }, status: :created
          else
            render json: { errors: marker.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @marker.update(marker_params)
            render json: { simulated_technician_marker: @marker }, status: :ok
          else
            render json: { errors: @marker.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @marker.destroy!
          head :no_content
        end

        private

        def set_marker
          @marker = SimulatedTechnicianMarker.find_by(id: params[:id])
          return if @marker.present?

          render json: { error: "Simulated marker not found" }, status: :not_found
        end

        def marker_params
          params.permit(:name, :latitude, :longitude, :trade_label, :active)
        end
      end
    end
  end
end
