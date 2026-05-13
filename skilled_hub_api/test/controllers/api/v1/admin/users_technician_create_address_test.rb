# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    module Admin
      class UsersTechnicianCreateAddressTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        test "admin create technician persists structured address fields" do
          admin = User.create!(
            email: "admin-tech-address@example.com",
            password: "password123",
            password_confirmation: "password123",
            role: :admin,
            phone: "713-555-0600"
          )

          post "/api/v1/admin/users",
               params: {
                 role: "technician",
                 email: "new-tech-address@example.com",
                 first_name: "Test",
                 last_name: "Tech",
                 phone: "713-555-0601",
                 trade_type: "Electrician",
                 location: "Houston, TX",
                 address: "1200 Smith St",
                 city: "Houston",
                 state: "TX",
                 zip_code: "77002",
                 country: "United States"
               },
               headers: auth_header_for(admin),
               as: :json

          assert_response :created
          user = User.find_by(email: "new-tech-address@example.com")
          assert user
          tp = user.technician_profile
          assert_equal "1200 Smith St", tp.address
          assert_equal "Houston", tp.city
          assert_equal "TX", tp.state
          assert_equal "77002", tp.zip_code
          assert_equal "United States", tp.country
        end
      end
    end
  end
end
