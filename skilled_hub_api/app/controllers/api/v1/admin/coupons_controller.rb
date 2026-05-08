module Api
  module V1
    module Admin
      class CouponsController < ApplicationController
        before_action :authenticate_user
        before_action :require_admin
        before_action :set_coupon, only: %i[show update destroy]

        def index
          coupons = Coupon.includes(coupon_assignments: :user).order(created_at: :desc)
          render json: { coupons: coupons.map { |coupon| serialize_coupon(coupon) } }, status: :ok
        end

        def show
          render json: { coupon: serialize_coupon(@coupon) }, status: :ok
        end

        def create
          coupon = Coupon.new(coupon_params)
          if coupon.save
            render json: { coupon: serialize_coupon(coupon) }, status: :created
          else
            render json: { errors: coupon.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @coupon.update(coupon_params)
            render json: { coupon: serialize_coupon(@coupon.reload) }, status: :ok
          else
            render json: { errors: @coupon.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @coupon.destroy!
          head :no_content
        end

        private

        def set_coupon
          @coupon = Coupon.find_by(id: params[:id])
          return if @coupon.present?

          render json: { error: "Coupon not found" }, status: :not_found
        end

        def coupon_params
          params.permit(:name, :code, :discount_kind, :discount_value, :active, :starts_at, :ends_at, :duration_template, :duration_days)
        end

        def serialize_coupon(coupon)
          {
            id: coupon.id,
            name: coupon.name,
            code: coupon.code,
            discount_kind: coupon.discount_kind,
            discount_value: coupon.discount_value,
            active: coupon.active,
            starts_at: coupon.starts_at,
            ends_at: coupon.ends_at,
            duration_template: coupon.duration_template,
            duration_days: coupon.duration_days,
            assignments: coupon.coupon_assignments.order(created_at: :desc).map do |a|
              {
                id: a.id,
                user_id: a.user_id,
                user_email: a.user&.email,
                status: a.status,
                auto_renew: a.auto_renew,
                activated_at: a.activated_at,
                starts_at: a.starts_at,
                expires_at: a.expires_at,
                remaining_seconds: a.remaining_seconds
              }
            end
          }
        end
      end
    end
  end
end
