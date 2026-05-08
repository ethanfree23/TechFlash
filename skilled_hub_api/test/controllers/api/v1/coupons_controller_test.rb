require "test_helper"

module Api
  module V1
    class CouponsControllerTest < ActionDispatch::IntegrationTest
      include AuthTestHelper

      test "technician can redeem active coupon" do
        user = User.create!(email: "coupon-tech@example.com", password: "password123", password_confirmation: "password123", role: :technician)
        TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic")
        coupon = Coupon.create!(name: "Launch", code: "LAUNCH25", discount_kind: "percent", discount_value: 25, active: true, duration_template: "one_month")

        post "/api/v1/coupons/redeem", params: { code: coupon.code }, headers: auth_header_for(user), as: :json

        assert_response :ok
        assignment = CouponAssignment.order(:id).last
        assert_equal user.id, assignment.user_id
        assert_equal coupon.id, assignment.coupon_id
      end
    end
  end
end
