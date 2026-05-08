module Api
  module V1
    class JobAlertPreferencesController < ApplicationController
      before_action :authenticate_user

      def show
        pref = @current_user.job_alert_preference || JobAlertDispatcher.default_preference_for(@current_user)
        render json: { job_alert_preference: serialize(pref) }, status: :ok
      end

      def update
        pref = @current_user.job_alert_preference || @current_user.build_job_alert_preference
        if pref.update(pref_params)
          render json: { job_alert_preference: serialize(pref) }, status: :ok
        else
          render json: { errors: pref.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def pref_params
        params.permit(:trade_label, :min_hourly_rate_cents, :max_distance_miles, :max_duration_days, :email_enabled, :sms_enabled, :app_enabled)
      end

      def serialize(pref)
        {
          trade_label: pref.trade_label,
          min_hourly_rate_cents: pref.min_hourly_rate_cents,
          max_distance_miles: pref.max_distance_miles,
          max_duration_days: pref.max_duration_days,
          email_enabled: pref.email_enabled,
          sms_enabled: pref.sms_enabled,
          app_enabled: pref.app_enabled
        }
      end
    end
  end
end
