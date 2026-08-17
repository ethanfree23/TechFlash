# frozen_string_literal: true

module Api
  module V1
    class InternalPaymentsController < ActionController::API
      def release_eligible
        unless valid_cron_secret?
          return render json: { error: "Unauthorized" }, status: :unauthorized
        end

        result = PaymentsReleaseRunner.call
        render json: result, status: :ok
      end

      private

      def valid_cron_secret?
        expected = ENV["PAYMENTS_CRON_SECRET"].to_s
        return false if expected.blank?

        provided = request.headers["X-Payments-Cron-Secret"].to_s.presence || params[:secret].to_s
        ActiveSupport::SecurityUtils.secure_compare(provided, expected)
      rescue ArgumentError
        false
      end
    end
  end
end
