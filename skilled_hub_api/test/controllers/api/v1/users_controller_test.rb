require "test_helper"

module Api
  module V1
    class UsersControllerTest < ActionDispatch::IntegrationTest
      test "technician signup requires city" do
        post "/api/v1/users",
             params: {
               email: "tech-no-city@example.com",
               password: "password123",
               password_confirmation: "password123",
               role: "technician",
               membership_tier: "basic"
             },
             as: :json

        assert_response :unprocessable_entity
        body = JSON.parse(response.body)
        assert_match(/city is required/i, body["error"].to_s)
      end

      test "technician signup stores city in profile" do
        post "/api/v1/users",
             params: {
               email: "tech-with-city@example.com",
               password: "password123",
               password_confirmation: "password123",
               role: "technician",
               membership_tier: "basic",
               city: "Houston"
             },
             as: :json

        assert_response :created
        user = User.find_by!(email: "tech-with-city@example.com")
        profile = user.technician_profile
        assert_not_nil profile
        assert_equal "Houston", profile.city
      end

      test "company signup does not require city" do
        post "/api/v1/users",
             params: {
               email: "company-no-city@example.com",
               password: "password123",
               password_confirmation: "password123",
               role: "company",
               membership_tier: "basic"
             },
             as: :json

        assert_response :created
        user = User.find_by!(email: "company-no-city@example.com")
        assert_equal "company", user.role
        assert_not_nil user.company_profile
      end
    end
  end
end
