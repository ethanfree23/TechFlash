# frozen_string_literal: true

module Api
  module V1
    module Admin
      class TechnicianOnboardingsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        # GET /api/v1/admin/technician_onboarding/settings
        def settings
          render json: {
            settings: TechnicianGuidedOnboarding.settings,
            dry_run: TechnicianOnboardingGrandfathering.dry_run(limit_samples: 10)
          }, status: :ok
        end

        # PATCH /api/v1/admin/technician_onboarding/settings
        def update_settings
          updated = TechnicianGuidedOnboarding.update_settings!(
            enabled: params[:enabled],
            assessment_reminder_days: params[:assessment_reminder_days]
          )
          render json: { settings: updated }, status: :ok
        end

        # GET /api/v1/admin/technician_onboarding/dry_run
        def dry_run
          result = TechnicianOnboardingGrandfathering.dry_run(limit_samples: (params[:limit] || 25).to_i)
          render json: {
            total_technicians: result.total_technicians,
            would_grandfather: result.would_grandfather,
            would_require: result.would_require,
            ambiguous: result.ambiguous,
            samples: result.samples
          }, status: :ok
        end

        # POST /api/v1/admin/users/:user_id/technician_onboarding/require
        def require_onboarding
          user = User.find_by(id: params[:user_id] || params[:id])
          return render json: { error: "User not found" }, status: :not_found unless user
          return render json: { error: "Technician only" }, status: :unprocessable_entity unless user.technician?

          record = TechnicianOnboarding.ensure_for!(user)
          previous_status = record.status
          previous_completed_at = record.completed_at
          record.require_again!(admin: @current_user)

          VerificationAuditLog.create!(
            user_id: user.id,
            actor_user_id: @current_user.id,
            entity_type: "TechnicianOnboarding",
            entity_id: record.id,
            action: "require_guided_onboarding",
            details: {
              previous_status: previous_status,
              previous_completed_at: previous_completed_at&.iso8601
            }
          )

          render json: {
            ok: true,
            onboarding: TechnicianOnboardingProgress.for(user.reload)
          }, status: :ok
        end

        # GET /api/v1/admin/users/:user_id/technician_onboarding
        def show
          user = User.find_by(id: params[:user_id] || params[:id])
          return render json: { error: "User not found" }, status: :not_found unless user
          return render json: { error: "Technician only" }, status: :unprocessable_entity unless user.technician?

          render json: TechnicianOnboardingProgress.for(user), status: :ok
        end
      end
    end
  end
end
