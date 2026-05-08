module Api
  module V1
    class AppNotificationsController < ApplicationController
      before_action :authenticate_user

      def index
        notifications = @current_user.app_notifications.order(created_at: :desc).limit(100)
        render json: { app_notifications: notifications }, status: :ok
      end

      def mark_read
        notification = @current_user.app_notifications.find_by(id: params[:id])
        return render json: { error: "Notification not found" }, status: :not_found if notification.blank?

        notification.update!(read_at: Time.current)
        render json: { app_notification: notification }, status: :ok
      end
    end
  end
end
