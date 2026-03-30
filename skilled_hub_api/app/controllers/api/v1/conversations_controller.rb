module Api
  module V1
    class ConversationsController < ApplicationController
      before_action :authenticate_user
      before_action :set_conversation, only: [:show]

      def index
        conversations = conversations_for_current_user
        render json: conversations, each_serializer: ConversationSerializer,
          include: [:job, { technician_profile: :user }, { company_profile: :user }],
          status: :ok
      end

      def show
        render json: @conversation, serializer: ConversationSerializer,
          include: [:job, :messages, { technician_profile: :user }, { company_profile: :user }],
          status: :ok
      end

      def create
        job = Job.find(params[:job_id])
        conversation = find_or_create_conversation(job)
        if conversation
          render json: conversation, serializer: ConversationSerializer,
            include: [:job, :technician_profile, :company_profile],
            status: :created
        else
          render json: { error: 'Could not create conversation' }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Job not found' }, status: :not_found
      end

      private

      def set_conversation
        @conversation = Conversation.find(params[:id])
        unless conversation_participant?(@conversation)
          return render json: { error: 'Access denied' }, status: :forbidden
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Conversation not found' }, status: :not_found
      end

      def conversations_for_current_user
        if @current_user.admin?
          return Conversation.feedback_threads
            .includes(:job, :technician_profile, :company_profile, :messages, :feedback_submission)
            .order(updated_at: :desc)
        end

        if @current_user.technician?
          profile = @current_user.technician_profile
          return Conversation.none unless profile

          Conversation.job_threads.where(technician_profile_id: profile.id)
        elsif @current_user.company?
          profile = @current_user.company_profile
          return Conversation.none unless profile

          Conversation.job_threads.where(company_profile_id: profile.id)
        else
          Conversation.none
        end.includes(:job, :technician_profile, :company_profile, :messages)
      end

      def conversation_participant?(conv)
        return true if conv.feedback? && @current_user.admin?

        if @current_user.technician?
          profile = @current_user.technician_profile
          profile && conv.technician_profile_id == profile.id && conv.job_thread?
        elsif @current_user.company?
          profile = @current_user.company_profile
          profile && conv.company_profile_id == profile.id && conv.job_thread?
        else
          false
        end
      end

      def find_or_create_conversation(job)
        if @current_user.technician?
          ensure_technician_profile!
          conv = Conversation.find_or_initialize_by(
            job_id: job.id,
            technician_profile_id: @current_user.technician_profile.id,
            company_profile_id: job.company_profile_id
          )
        else
          return nil unless @current_user.company? && job.company_profile_id == @current_user.company_profile.id
          # Company messaging tech: use job's claimed technician or params
          tech_id = params[:technician_profile_id]
          tech_id ||= job.job_applications.find_by(status: :accepted)&.technician_profile_id
          return nil if tech_id.blank?
          conv = Conversation.find_or_initialize_by(
            job_id: job.id,
            technician_profile_id: tech_id,
            company_profile_id: job.company_profile_id
          )
        end
        conv.conversation_type = Conversation::TYPE_JOB if conv.new_record?
        conv.save ? conv : nil
      end

      def ensure_technician_profile!
        return if @current_user.technician_profile.present?
        TechnicianProfile.create!(
          user: @current_user,
          trade_type: 'General',
          experience_years: 0,
          availability: 'Full-time'
        )
      end
    end
  end
end
