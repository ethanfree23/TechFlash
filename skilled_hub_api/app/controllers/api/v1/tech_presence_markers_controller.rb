module Api
  module V1
    class TechPresenceMarkersController < ApplicationController
      before_action :authenticate_user

      def index
        technicians = TechnicianProfile.includes(:user).where.not(latitude: nil, longitude: nil)
        real_markers = technicians.map { |profile| serialize_real_marker(profile) }
        simulated = SimulatedTechnicianMarker.where(active: true).map { |marker| serialize_simulated_marker(marker) }
        render json: { markers: real_markers + simulated }, status: :ok
      end

      private

      def serialize_real_marker(profile)
        lat, lng =
          if @current_user&.admin?
            [profile.latitude.to_f, profile.longitude.to_f]
          else
            MapPrivacyService.blurred_coordinates(
              latitude: profile.latitude,
              longitude: profile.longitude,
              seed_key: "technician_profile:#{profile.id}"
            )
          end

        {
          id: "real-#{profile.id}",
          marker_type: "real",
          latitude: lat,
          longitude: lng,
          trade_label: profile.trade_type.to_s.presence || "General",
          color: @current_user&.admin? ? "#2563eb" : nil
        }
      end

      def serialize_simulated_marker(marker)
        {
          id: "sim-#{marker.id}",
          marker_type: "simulated",
          latitude: marker.latitude.to_f,
          longitude: marker.longitude.to_f,
          trade_label: marker.trade_label,
          color: @current_user&.admin? ? "#14b8a6" : nil
        }
      end
    end
  end
end
