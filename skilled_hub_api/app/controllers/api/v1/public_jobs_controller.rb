# frozen_string_literal: true

module Api
  module V1
    class PublicJobsController < ApplicationController
      # Public share preview — no JWT; authorized only by unguessable share_token.

      def show
        job = Job.includes(:company_profile).find_by!(share_token: params[:share_token])
        render json: job, serializer: PublicJobPreviewSerializer, adapter: :attributes, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Job not found" }, status: :not_found
      end
    end
  end
end
