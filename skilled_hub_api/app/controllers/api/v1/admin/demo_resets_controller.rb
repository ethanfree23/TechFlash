# frozen_string_literal: true

module Api
  module V1
    module Admin
      class DemoResetsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin

        def create
          unless DemoMode.enabled?
            return render json: {
              error: "Demo reset is only available in the demo environment (RAILS_ENV=demo)."
            }, status: :forbidden
          end

          Demo::ResetGuard.verify!
          stats = Demo::Seeder.reset!

          render json: {
            success: true,
            message: "Demo database reset to polished seed state.",
            stats: stats,
            flagship_job_id: stats[:flagship_job_id],
            reviewed_job_id: stats[:reviewed_job_id]
          }, status: :ok
        rescue DemoMode::SafetyError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end
      end
    end
  end
end
