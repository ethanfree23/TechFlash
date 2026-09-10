# frozen_string_literal: true

module Api
  module V1
    module Admin
      # TEMPORARY: inspect running-container storage. Remove after the volume investigation.
      class StorageDiagnosticsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        def show
          render json: AdminStorageDiagnostic.capture, status: :ok
        end

        def check
          render json: AdminStorageDiagnostic.check, status: :ok
        end

        private

        def handle_server_error(exception)
          render json: {
            ok: false,
            observed_at: Time.now.utc.iso8601,
            exception: AdminStorageDiagnostic.error_payload(exception)
          }, status: :internal_server_error
        end
      end
    end
  end
end
