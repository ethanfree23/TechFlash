# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Issues a short-lived JWT that identifies as another user (admin support / troubleshooting).
      # Exit masquerade is handled client-side by restoring the prior admin session from sessionStorage.
      class MasqueradesController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        MASQUERADE_TTL = 8.hours

        # POST /api/v1/admin/masquerade
        # JSON: { "target_user_id": <id> }
        def create
          target_id = params[:target_user_id].presence || params[:user_id].presence
          if target_id.blank?
            return render json: { errors: ["target_user_id is required"] }, status: :unprocessable_entity
          end

          target = User.find_by(id: target_id.to_i)
          return render json: { errors: ["User not found"] }, status: :not_found unless target

          if target.admin?
            return render json: { errors: ["Cannot masquerade as another admin"] }, status: :forbidden
          end

          payload = {
            user_id: target.id,
            masquerade: true,
            impersonator_id: @current_user.id,
            exp: MASQUERADE_TTL.from_now.to_i
          }
          token = JWT.encode(payload, Rails.application.secret_key_base, "HS256")

          render json: {
            token: token,
            user: UserSerializer.new(target).as_json,
            expires_in_seconds: MASQUERADE_TTL.to_i
          }, status: :created
        end
      end
    end
  end
end
