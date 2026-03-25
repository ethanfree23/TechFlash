module Api
  module V1
    class FeedbackSubmissionsController < ApplicationController
      before_action :authenticate_user

      def create
        submission = @current_user.feedback_submissions.build(feedback_params)
        if submission.save
          admin_emails = User.where(role: :admin).pluck(:email).compact.uniq
          UserMailer.admin_feedback(submission).deliver_later if admin_emails.any?
          render json: { id: submission.id, message: 'Thanks — we received your feedback.' }, status: :created
        else
          render json: { errors: submission.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def feedback_params
        params.permit(:kind, :body, :page_path)
      end
    end
  end
end
