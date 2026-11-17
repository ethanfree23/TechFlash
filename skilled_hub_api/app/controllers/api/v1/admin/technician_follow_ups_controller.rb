# frozen_string_literal: true

module Api
  module V1
    module Admin
      class TechnicianFollowUpsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/technician_follow_ups
        # GET /api/v1/admin/users/:user_id/technician_follow_ups
        def index
          if params[:user_id].present?
            technician = User.find_by(id: params[:user_id])
            return render json: { error: "User not found" }, status: :not_found unless technician
            return render json: { error: "User must be a technician" }, status: :unprocessable_entity unless technician.technician?

            records = TechnicianFollowUp.where(user_id: technician.id)
              .includes(:assigned_admin, :created_by, :user)
              .order(Arel.sql("CASE status WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END"), :due_at, :id)
          else
            scope = params[:scope].presence || "open"
            records = TechnicianActivationPipeline.follow_ups_for(
              scope: scope,
              assigned_admin_id: params[:assigned_admin_id]
            )
          end

          render json: {
            follow_ups: records.map { |fu| TechnicianActivationSerializer.follow_up_payload(fu) },
            counts: TechnicianActivationPipeline.counts
          }, status: :ok
        end

        # POST /api/v1/admin/users/:user_id/technician_follow_ups
        def create
          technician = User.find_by(id: params[:user_id])
          return render json: { error: "User not found" }, status: :not_found unless technician
          return render json: { error: "User must be a technician" }, status: :unprocessable_entity unless technician.technician?

          due_at = parse_time(params[:due_at])
          return render json: { errors: ["due_at is required"] }, status: :unprocessable_entity unless due_at

          assigned = if params[:assigned_admin_id].present?
                       User.admin.find_by(id: params[:assigned_admin_id])
                     else
                       @current_user
                     end
          return render json: { errors: ["assigned admin not found"] }, status: :unprocessable_entity unless assigned

          TechnicianActivation.ensure_for!(technician)

          follow_up = TechnicianFollowUp.new(
            user: technician,
            assigned_admin: assigned,
            created_by: @current_user,
            due_at: due_at,
            description: params[:description],
            technician_interaction_id: params[:technician_interaction_id]
          )

          if follow_up.save
            interaction = TechnicianInteraction.create!(
              user: technician,
              author: @current_user,
              interaction_type: "follow_up",
              body: params[:description].presence || "Follow-up scheduled",
              follow_up_at: due_at,
              occurred_at: Time.current,
              metadata: { follow_up_id: follow_up.id }
            )
            follow_up.update_columns(technician_interaction_id: interaction.id)

            activation = TechnicianActivation.ensure_for!(technician)
            activation.refresh_follow_up_cache!

            render json: {
              follow_up: TechnicianActivationSerializer.follow_up_payload(follow_up.reload),
              interaction: TechnicianActivationSerializer.interaction_payload(interaction),
              activation: TechnicianActivationSerializer.activation_payload(
                activation.reload,
                onboarding: TechnicianOnboardingReadiness.call(technician, activation: activation)
              )
            }, status: :created
          else
            render json: { errors: follow_up.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/technician_follow_ups/:id
        def update
          follow_up = TechnicianFollowUp.find_by(id: params[:id])
          return render json: { error: "Follow-up not found" }, status: :not_found unless follow_up

          if params.key?(:status)
            case params[:status].to_s
            when "completed"
              follow_up.complete!(admin: @current_user)
            when "canceled"
              follow_up.cancel!
            when "open"
              follow_up.update!(status: "open", completed_at: nil)
            else
              return render json: { errors: ["Invalid status"] }, status: :unprocessable_entity
            end
          end

          attrs = {}
          attrs[:due_at] = parse_time(params[:due_at]) if params.key?(:due_at)
          attrs[:description] = params[:description] if params.key?(:description)
          if params.key?(:assigned_admin_id)
            admin = User.admin.find_by(id: params[:assigned_admin_id])
            return render json: { errors: ["assigned admin not found"] }, status: :unprocessable_entity unless admin

            attrs[:assigned_admin] = admin
          end

          if attrs.key?(:due_at) && attrs[:due_at].nil?
            return render json: { errors: ["due_at is invalid"] }, status: :unprocessable_entity
          end

          follow_up.update!(attrs) if attrs.any?

          render json: {
            follow_up: TechnicianActivationSerializer.follow_up_payload(follow_up.reload),
            counts: TechnicianActivationPipeline.counts
          }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        private

        def parse_time(value)
          return value if value.is_a?(Time) || value.is_a?(ActiveSupport::TimeWithZone)
          return nil if value.blank?

          Time.zone.parse(value.to_s)
        rescue ArgumentError, TypeError
          nil
        end
      end
    end
  end
end
