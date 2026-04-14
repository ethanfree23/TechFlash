# frozen_string_literal: true

module Api
  module V1
    class JobIssueReportsController < ApplicationController
      before_action :authenticate_user

      def create
        job = Job.find(params[:job_id])
        unless participant?(job)
          return render json: { error: 'You can only report issues on jobs you are involved with.' }, status: :forbidden
        end

        report = job.job_issue_reports.build(
          user: @current_user,
          body: params[:body].to_s,
          category: params[:category].presence || 'general'
        )
        if report.save
          MailDelivery.safe_deliver { UserMailer.job_issue_report(report).deliver_now }
          render json: { id: report.id, message: 'Report submitted. Our team will review it.' }, status: :created
        else
          render json: { errors: report.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def participant?(job)
        return true if @current_user.admin?
        return true if @current_user.company? && job.company_profile.user_id == @current_user.id

        if @current_user.technician?
          app = job.job_applications.find_by(status: :accepted)
          app&.technician_profile&.user_id == @current_user.id
        else
          false
        end
      end
    end
  end
end
