require "test_helper"

module Api
  module V1
    class PasswordResetsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @user = User.create!(
          email: "reset-flow-user@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
      end

      test "create returns no content for unknown email" do
        post "/api/v1/password_resets", params: { email: "missing-user@example.com" }, as: :json

        assert_response :no_content
      end

      test "create returns service unavailable when delivery fails" do
        MailDelivery.stub(:safe_deliver_result, ->(&_) { { success: false, error: "smtp down", code: "delivery_exception" } }) do
          post "/api/v1/password_resets", params: { email: @user.email }, as: :json
        end

        assert_response :service_unavailable
        body = JSON.parse(response.body)
        assert_match(/could not be sent/i, body["error"].to_s)
        @user.reload
        assert @user.password_reset_token.present?
        assert @user.password_reset_sent_at.present?
      end

      test "create returns no content when delivery succeeds" do
        MailDelivery.stub(:safe_deliver_result, ->(&_) { { success: true, code: "ok" } }) do
          post "/api/v1/password_resets", params: { email: @user.email }, as: :json
        end

        assert_response :no_content
        @user.reload
        assert @user.password_reset_token.present?
        assert @user.password_reset_sent_at.present?
      end
    end
  end
end
