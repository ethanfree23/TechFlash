module Api
  module V1
    class CouponsController < ApplicationController
      before_action :authenticate_user

      def redeem
        code = params[:code].to_s.strip.upcase
        coupon = Coupon.find_by(code: code)
        return render json: { error: "Coupon not found" }, status: :not_found if coupon.blank?
        return render json: { error: "Coupon is not active" }, status: :unprocessable_entity unless coupon.active_now?

        assignment = CouponAssignment.find_or_initialize_by(coupon_id: coupon.id, user_id: @current_user.id)
        assignment.status = "active"
        assignment.activated_at ||= Time.current
        assignment.starts_at ||= Time.current
        assignment.expires_at ||= compute_expires_at(coupon: coupon, assignment: assignment)
        assignment.save!

        render json: { coupon_assignment: serialize_assignment(assignment) }, status: :ok
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def compute_expires_at(coupon:, assignment:)
        case coupon.duration_template
        when "one_month"
          assignment.starts_at.to_time + 30.days
        when "three_months"
          assignment.starts_at.to_time + 90.days
        when "custom_days"
          assignment.starts_at.to_time + coupon.duration_days.to_i.days
        else
          coupon.ends_at
        end
      end

      def serialize_assignment(assignment)
        {
          id: assignment.id,
          coupon_id: assignment.coupon_id,
          status: assignment.status,
          starts_at: assignment.starts_at,
          expires_at: assignment.expires_at,
          auto_renew: assignment.auto_renew
        }
      end
    end
  end
end
