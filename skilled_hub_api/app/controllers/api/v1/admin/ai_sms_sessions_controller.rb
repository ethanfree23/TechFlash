# frozen_string_literal: true

module Api
  module V1
    module Admin
      class AiSmsSessionsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :load_user

        def show
          render json: Ai::SessionAdmin.payload_for(@user), status: :ok
        end

        def create
          outcome = Ai::TechnicianVerificationStarter.call(user: @user, actor: @current_user)
          payload = Ai::SessionAdmin.payload_for(@user.reload).merge(
            success: outcome.ok,
            status: outcome.status,
            resumed: outcome.resumed,
            error: outcome.error,
            outbound_message: outcome.outbound_message
          )
          render json: payload.compact, status: outcome.http_status || :unprocessable_entity
        end

        def pause
          session = AiSmsSession.live_for(@user)
          outcome = Ai::SessionAdmin.pause(session: session)
          render_session_outcome(outcome)
        end

        def end_session
          session = AiSmsSession.current_for(@user)
          outcome = Ai::SessionAdmin.end_session(session: session)
          render_session_outcome(outcome)
        end

        private

        def load_user
          @user = User.includes(:technician_profile, :company_profile).find_by(id: params[:user_id])
          return render json: { error: "User not found" }, status: :not_found if @user.blank?
          return render json: { error: "User is an admin account" }, status: :unprocessable_entity if @user.admin?
        end

        def render_session_outcome(outcome)
          payload = Ai::SessionAdmin.payload_for(@user.reload).merge(
            success: outcome.ok,
            error: outcome.error
          )
          render json: payload.compact, status: outcome.http_status || :unprocessable_entity
        end
      end
    end
  end
end
