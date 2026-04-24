module Api
  module V1
    module Admin
      class ReferralsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_referral

        def issue_reward
          if @referral.reward_issued_at.present?
            return render json: { error: "Reward already marked as issued" }, status: :unprocessable_entity
          end

          if @referral.reward_eligible_at.blank?
            return render json: { error: "Referral is not eligible yet" }, status: :unprocessable_entity
          end

          @referral.update!(reward_issued_at: Time.current)
          render json: {
            referral: {
              id: @referral.id,
              reward_eligible_at: @referral.reward_eligible_at,
              reward_issued_at: @referral.reward_issued_at
            }
          }, status: :ok
        end

        private

        def set_referral
          @referral = ReferralSubmission.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Referral not found" }, status: :not_found
        end
      end
    end
  end
end
