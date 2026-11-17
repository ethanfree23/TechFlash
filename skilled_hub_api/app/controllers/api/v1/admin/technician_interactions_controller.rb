# frozen_string_literal: true

module Api
  module V1
    module Admin
      class TechnicianInteractionsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_technician

        # GET /api/v1/admin/users/:user_id/technician_interactions
        def index
          page = [params[:page].to_i, 1].max
          per_page = [[params[:per_page].to_i, 1].max, 100].min
          per_page = 25 if params[:per_page].blank?

          scope = TechnicianInteraction.for_user(@technician.id).newest_first
          total = scope.count
          records = scope.offset((page - 1) * per_page).limit(per_page).includes(:author)

          render json: {
            interactions: records.map { |i| TechnicianActivationSerializer.interaction_payload(i) },
            pagination: {
              page: page,
              per_page: per_page,
              total: total,
              total_pages: (total.to_f / per_page).ceil
            }
          }, status: :ok
        end

        # POST /api/v1/admin/users/:user_id/technician_interactions
        def create
          result = TechnicianInteractionLogger.create!(
            user: @technician,
            admin: @current_user,
            params: interaction_params
          )
          render_logger_result(result)
        end

        # POST /api/v1/admin/users/:user_id/technician_interactions/import_local
        def import_local
          notes = params.permit(notes: %i[id local_id body at occurred_at admin]).fetch(:notes, [])
          result = TechnicianInteractionLogger.import_local!(
            user: @technician,
            admin: @current_user,
            notes: notes
          )

          payload = {
            imported_count: result.imported_count,
            skipped_count: result.skipped_count,
            interactions: result.interactions,
            activation: TechnicianActivationSerializer.activation_payload(
              result.activation,
              onboarding: result.onboarding
            )
          }
          payload[:errors] = result.errors if result.errors.present?
          render json: payload, status: result.http_status
        end

        private

        def set_technician
          @technician = User.find_by(id: params[:user_id])
          return render json: { error: "User not found" }, status: :not_found unless @technician
          return render json: { error: "User is an admin account" }, status: :unprocessable_entity if @technician.admin?
          return render json: { error: "User must be a technician" }, status: :unprocessable_entity unless @technician.technician?
        end

        def interaction_params
          params.permit(
            :interaction_type,
            :outcome,
            :body,
            :follow_up_at,
            :next_follow_up_at,
            :follow_up_description,
            :occurred_at,
            :client_key,
            :skip_auto_status,
            metadata: {}
          )
        end

        def render_logger_result(result)
          if result.ok
            render json: {
              interaction: TechnicianActivationSerializer.interaction_payload(result.interaction),
              follow_up: result.follow_up && TechnicianActivationSerializer.follow_up_payload(result.follow_up),
              activation: TechnicianActivationSerializer.activation_payload(
                result.activation,
                onboarding: result.onboarding
              )
            }, status: result.http_status
          else
            render json: { errors: result.errors }, status: result.http_status
          end
        end
      end
    end
  end
end
