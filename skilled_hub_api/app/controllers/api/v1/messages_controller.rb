module Api
  module V1
    class MessagesController < ApplicationController
      before_action :authenticate_user
      before_action :set_conversation
      before_action :authorize_participant

      def index
        messages = @conversation.messages.order(created_at: :asc)
        render json: messages, each_serializer: MessageSerializer, status: :ok
      end

      def create
        if @conversation.feedback?
          return render json: {
            error: 'Feedback inbox items are notifications only; replies are not supported.'
          }, status: :forbidden
        end

        message = @conversation.messages.build(message_params)
        message.sender = current_user_profile
        if message.save
          UserMailer.new_message(message).deliver_later if @conversation.job_thread?
          render json: message, serializer: MessageSerializer, status: :created
        else
          render json: { errors: message.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_conversation
        @conversation = Conversation.find(params[:conversation_id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Conversation not found' }, status: :not_found
      end

      def authorize_participant
        unless conversation_participant?
          return render json: { error: 'Access denied' }, status: :forbidden
        end
      end

      def conversation_participant?
        return true if @current_user.admin? && @conversation.feedback?

        if @current_user.technician?
          profile = @current_user.technician_profile
          profile && @conversation.technician_profile_id == profile.id && @conversation.job_thread?
        elsif @current_user.company?
          profile = @current_user.company_profile
          profile && @conversation.company_profile_id == profile.id && @conversation.job_thread?
        else
          false
        end
      end

      def current_user_profile
        if @current_user.technician?
          @current_user.technician_profile
        else
          @current_user.company_profile
        end
      end

      def message_params
        params.permit(:content)
      end
    end
  end
end
