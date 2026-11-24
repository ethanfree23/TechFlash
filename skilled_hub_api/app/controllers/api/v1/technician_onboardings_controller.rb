# frozen_string_literal: true

module Api
  module V1
    class TechnicianOnboardingsController < ApplicationController
      before_action :authenticate_user
      before_action :require_technician

      # GET /api/v1/technician_onboarding
      def show
        render json: TechnicianOnboardingProgress.for(@current_user), status: :ok
      end

      # PATCH /api/v1/technician_onboarding
      # Persist wizard progress (section/substep) and optional section completion marks.
      def update
        record = TechnicianOnboarding.ensure_for!(@current_user)
        section = params[:current_section].presence || params[:section].presence
        substep = params[:current_substep].presence || params[:substep].presence
        completed_section = params[:completed_section].presence

        if section.present? || completed_section.present?
          record.mark_progress!(
            section: section.presence || record.current_section.presence || "welcome",
            substep: substep,
            completed_section: completed_section
          )
        elsif record.not_started?
          record.mark_started!
        else
          record.update!(last_activity_at: Time.current)
        end

        if params[:section_statuses].is_a?(ActionController::Parameters) || params[:section_statuses].is_a?(Hash)
          merged = record.section_statuses.stringify_keys
          params[:section_statuses].each do |key, value|
            merged[key.to_s] = value.is_a?(ActionController::Parameters) ? value.to_unsafe_h : value
          end
          record.update!(section_statuses: merged, last_activity_at: Time.current)
        end

        if ActiveModel::Type::Boolean.new.cast(params[:welcome_banner_dismissed])
          record.update!(welcome_banner_dismissed: true)
        end

        render json: TechnicianOnboardingProgress.for(@current_user.reload), status: :ok
      end

      # POST /api/v1/technician_onboarding/complete
      def complete
        result = TechnicianOnboardingCompleter.call(user: @current_user)
        if result.ok
          render json: {
            ok: true,
            already_complete: result.already_complete,
            onboarding: result.onboarding
          }, status: :ok
        else
          render json: {
            ok: false,
            error: result.error,
            onboarding: result.onboarding
          }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/technician_onboarding/start
      def start
        record = TechnicianOnboarding.ensure_for!(@current_user)
        record.mark_started!(section: params[:section].presence || "profile", substep: params[:substep])
        render json: TechnicianOnboardingProgress.for(@current_user.reload), status: :ok
      end
    end
  end
end
