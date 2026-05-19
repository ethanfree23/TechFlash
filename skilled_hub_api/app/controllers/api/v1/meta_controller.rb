# frozen_string_literal: true

module Api
  module V1
    class MetaController < ApplicationController
      skip_before_action :authenticate_user, raise: false

      def show
        payload = {
          demo_mode: DemoMode.enabled?,
          environment: Rails.env,
          app_name: "TechFlash"
        }
        if DemoMode.enabled?
          flagship = Job.where("notes LIKE ?", "%FLAGSHIP_DEMO_JOB%").order(:id).first
          payload[:flagship_job_id] = flagship&.id
          payload[:reviewed_job_id] = demo_reviewed_job_id
        end
        render json: payload
      end

      private

      def demo_reviewed_job_id
        Job.joins(:ratings).where(status: Job.statuses[:finished]).order(:id).pick(:id)
      end
    end
  end
end
