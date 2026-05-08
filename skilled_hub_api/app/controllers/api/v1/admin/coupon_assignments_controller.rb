module Api
  module V1
    module Admin
      class CouponAssignmentsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_assignment, only: %i[update destroy]

        def create
          assignment = CouponAssignment.new(create_params)
          assignment.assigned_by_id = @current_user.id
          assignment.activated_at ||= Time.current
          assignment.starts_at ||= Time.current
          assignment.expires_at ||= default_expires_at(assignment)
          if assignment.save
            render json: { coupon_assignment: serialize(assignment) }, status: :created
          else
            render json: { errors: assignment.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          attrs = params.permit(:status, :auto_renew, :starts_at, :expires_at).to_h
          attrs[:last_extended_at] = Time.current if attrs.key?("expires_at")
          if @assignment.update(attrs)
            render json: { coupon_assignment: serialize(@assignment.reload) }, status: :ok
          else
            render json: { errors: @assignment.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @assignment.destroy!
          head :no_content
        end

        private

        def set_assignment
          @assignment = CouponAssignment.find_by(id: params[:id])
          return if @assignment.present?

          render json: { error: "Coupon assignment not found" }, status: :not_found
        end

        def create_params
          params.permit(:coupon_id, :user_id, :status, :auto_renew, :starts_at, :expires_at)
        end

        def default_expires_at(assignment)
          coupon = assignment.coupon
          return coupon&.ends_at if coupon&.duration_template == "fixed_window"
          return assignment.starts_at.to_time + 30.days if coupon&.duration_template == "one_month"
          return assignment.starts_at.to_time + 90.days if coupon&.duration_template == "three_months"
          return assignment.starts_at.to_time + coupon.duration_days.to_i.days if coupon&.duration_template == "custom_days"

          nil
        end

        def serialize(assignment)
          {
            id: assignment.id,
            coupon_id: assignment.coupon_id,
            user_id: assignment.user_id,
            status: assignment.status,
            auto_renew: assignment.auto_renew,
            starts_at: assignment.starts_at,
            expires_at: assignment.expires_at,
            activated_at: assignment.activated_at,
            last_extended_at: assignment.last_extended_at
          }
        end
      end
    end
  end
end
