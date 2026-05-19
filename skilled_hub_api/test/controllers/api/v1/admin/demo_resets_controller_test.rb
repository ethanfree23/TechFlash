# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class DemoResetsControllerTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(
            email: "admin+demo_reset@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-882-0999"
          )
        end

        test "rejects reset when not in demo mode" do
          post "/api/v1/admin/demo_reset",
               headers: auth_header_for(@admin).merge("Content-Type" => "application/json")

          assert_response :forbidden
        end
      end
    end
  end
end
