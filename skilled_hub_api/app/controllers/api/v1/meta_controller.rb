# frozen_string_literal: true

module Api
  module V1
    class MetaController < ApplicationController
      skip_before_action :authenticate_user, raise: false

      def show
        payload = {
          demo_mode: DemoMode.enabled?,
          environment: Rails.env,
          app_name: "TechFlash",
          deploy: deploy_info
        }
        if DemoMode.enabled?
          flagship = Job.where("notes LIKE ?", "%FLAGSHIP_DEMO_JOB%").order(:id).first
          payload[:flagship_job_id] = flagship&.id
          payload[:reviewed_job_id] = demo_reviewed_job_id
        end
        render json: payload
      end

      private

      BOOTED_AT = Time.current.iso8601

      # Railway injects RAILWAY_GIT_* on every build; other hosts can set GIT_SHA.
      def deploy_info
        sha = ENV["RAILWAY_GIT_COMMIT_SHA"].presence || ENV["GIT_SHA"].presence
        {
          git_sha: sha,
          git_sha_short: sha&.first(7),
          git_branch: ENV["RAILWAY_GIT_BRANCH"].presence || ENV["GIT_BRANCH"].presence,
          deployment_id: ENV["RAILWAY_DEPLOYMENT_ID"].presence,
          booted_at: BOOTED_AT
        }
      end

      def demo_reviewed_job_id
        Job.joins(:ratings).where(status: Job.statuses[:finished]).order(:id).pick(:id)
      end
    end
  end
end
