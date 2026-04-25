# frozen_string_literal: true

module Api
  module V1
    class AddressesController < ApplicationController
      before_action :authenticate_user

      # GET /api/v1/address_suggestions?q=
      def suggestions
        q = params[:q].to_s.strip
        if q.length < 3
          return render json: { suggestions: [], provider: GeocodingService.address_provider }, status: :ok
        end

        list = GeocodingService.address_suggestions(q)
        render json: { suggestions: list, provider: GeocodingService.address_provider }, status: :ok
      end

      # GET /api/v1/address_resolve?place_id= (Google Places only)
      def resolve
        place_id = params[:place_id].to_s.strip
        if place_id.blank?
          return render json: { error: "place_id is required" }, status: :unprocessable_entity
        end

        result = GeocodingService.google_resolve_place(place_id)
        if result.blank?
          return render json: { error: "Could not resolve that place" }, status: :unprocessable_entity
        end

        render json: result, status: :ok
      end
    end
  end
end
