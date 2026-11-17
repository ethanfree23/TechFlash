# frozen_string_literal: true

module Api
  module V1
    module Admin
      class TechnicianActivationsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/technician_activation/pipeline_counts
        def pipeline_counts
          render json: { counts: TechnicianActivationPipeline.counts }, status: :ok
        end

        # GET /api/v1/admin/users/:user_id/technician_activation
        def show
          technician = find_technician!
          return unless technician

          activation = TechnicianActivation.ensure_for!(technician)
          onboarding = TechnicianOnboardingReadiness.call(technician, activation: activation)
          follow_ups = TechnicianFollowUp.open_for(technician.id).order(:due_at).limit(10)

          render json: {
            activation: TechnicianActivationSerializer.activation_payload(activation, onboarding: onboarding),
            follow_ups: follow_ups.map { |fu| TechnicianActivationSerializer.follow_up_payload(fu) },
            statuses: TechnicianActivation::STATUSES,
            availabilities: TechnicianActivation::AVAILABILITIES,
            call_outcomes: TechnicianInteraction::CALL_OUTCOMES,
            interaction_types: TechnicianInteraction::INTERACTION_TYPES
          }, status: :ok
        end

        # PATCH /api/v1/admin/users/:user_id/technician_activation
        def update
          technician = find_technician!
          return unless technician

          activation = TechnicianActivation.ensure_for!(technician)
          previous_status = activation.status
          attrs = {}

          if params.key?(:current_availability)
            availability = params[:current_availability].to_s.strip
            unless TechnicianActivation::AVAILABILITIES.include?(availability)
              return render json: { errors: ["Invalid availability"] }, status: :unprocessable_entity
            end
            attrs[:current_availability] = availability
          end

          status_changed = false
          if params.key?(:status)
            new_status = params[:status].to_s.strip
            unless TechnicianActivation::STATUSES.include?(new_status)
              return render json: { errors: ["Invalid status"] }, status: :unprocessable_entity
            end
            if new_status != activation.status
              activation.apply_status!(new_status, admin: @current_user)
              status_changed = true
            end
          end

          activation.update!(attrs) if attrs.any?

          if status_changed
            TechnicianInteraction.create!(
              user: technician,
              author: @current_user,
              interaction_type: "status_change",
              body: params[:note].presence || "Activation status changed",
              occurred_at: Time.current,
              metadata: {
                previous_status: previous_status,
                new_status: activation.status,
                auto: false
              }
            )
          end

          onboarding = TechnicianOnboardingReadiness.call(technician, activation: activation.reload)
          render json: {
            activation: TechnicianActivationSerializer.activation_payload(activation, onboarding: onboarding)
          }, status: :ok
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        # POST /api/v1/admin/users/:user_id/log_call
        def log_call
          technician = find_technician!
          return unless technician

          result = TechnicianInteractionLogger.log_call!(
            user: technician,
            admin: @current_user,
            params: log_call_params
          )

          if result.ok
            render json: {
              interaction: TechnicianActivationSerializer.interaction_payload(result.interaction),
              follow_up: result.follow_up && TechnicianActivationSerializer.follow_up_payload(result.follow_up),
              activation: TechnicianActivationSerializer.activation_payload(
                result.activation,
                onboarding: result.onboarding
              )
            }, status: :created
          else
            render json: { errors: result.errors }, status: result.http_status
          end
        end

        private

        def find_technician!
          user = User.find_by(id: params[:user_id] || params[:id])
          unless user
            render json: { error: "User not found" }, status: :not_found
            return nil
          end
          if user.admin?
            render json: { error: "User is an admin account" }, status: :unprocessable_entity
            return nil
          end
          unless user.technician?
            render json: { error: "User must be a technician" }, status: :unprocessable_entity
            return nil
          end
          user
        end

        def log_call_params
          params.permit(
            :outcome,
            :body,
            :follow_up_at,
            :next_follow_up_at,
            :follow_up_description,
            :client_key,
            :skip_auto_status
          )
        end
      end
    end
  end
end
