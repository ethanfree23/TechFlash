# frozen_string_literal: true

require "test_helper"

module Api
  module V1
    class SettingsPaymentMethodsTest < ActionDispatch::IntegrationTest
      setup do
        @user = User.create!(
          email: "pm-co-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company,
          stripe_customer_id: "cus_test_pm"
        )
        profile = CompanyProfile.create!(user: @user, membership_level: "basic")
        @user.update_column(:company_profile_id, profile.id)
        @token = JWT.encode({ user_id: @user.id, exp: 1.day.from_now.to_i }, Rails.application.secret_key_base, "HS256")
        @old_key = Stripe.api_key
        Stripe.api_key = "sk_test_ach_settings"
      end

      teardown do
        Stripe.api_key = @old_key
      end

      def auth_headers
        { "Authorization" => "Bearer #{@token}", "Content-Type" => "application/json" }
      end

      test "technician cannot list company payment methods" do
        tech = User.create!(
          email: "pm-tech-#{SecureRandom.hex(4)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        token = JWT.encode({ user_id: tech.id, exp: 1.day.from_now.to_i }, Rails.application.secret_key_base, "HS256")
        get "/api/v1/settings/payment_methods", headers: { "Authorization" => "Bearer #{token}" }
        assert_response :forbidden
      end

      test "create_setup_intent accepts us_bank_account type" do
        captured = {}
        Stripe::SetupIntent.stub(:create, ->(params) {
          captured.replace(params)
          OpenStruct.new(client_secret: "seti_secret_test", id: "seti_test")
        }) do
          StripeCustomerService.stub(:ensure_customer_id!, "cus_test_pm") do
            StripeModeGuard.stub(:error_message, nil) do
              post "/api/v1/settings/create_setup_intent",
                   params: { payment_method_type: "us_bank_account" }.to_json,
                   headers: auth_headers
            end
          end
        end

        assert_response :ok
        body = JSON.parse(response.body)
        assert_equal "seti_secret_test", body["client_secret"]
        assert_equal ["us_bank_account"], captured[:payment_method_types]
        assert_equal ["payment_method"], captured.dig(:payment_method_options, :us_bank_account, :financial_connections, :permissions)
        refute captured.key?(:mandate_data), "SetupIntent create must not include mandate_data"
      end

      test "create_setup_intent defaults to card" do
        captured = {}
        Stripe::SetupIntent.stub(:create, ->(params) {
          captured.replace(params)
          OpenStruct.new(client_secret: "seti_card_secret", id: "seti_card")
        }) do
          StripeCustomerService.stub(:ensure_customer_id!, "cus_test_pm") do
            StripeModeGuard.stub(:error_message, nil) do
              post "/api/v1/settings/create_setup_intent",
                   params: {}.to_json,
                   headers: auth_headers
            end
          end
        end

        assert_response :ok
        assert_equal ["card"], captured[:payment_method_types]
      end

      test "detach refuses payment methods owned by another customer" do
        pm = OpenStruct.new(id: "pm_other", customer: "cus_someone_else", type: "card")
        Stripe::PaymentMethod.stub(:retrieve, pm) do
          StripeCustomerService.stub(:validate_or_clear_customer_id!, "cus_test_pm") do
            StripeModeGuard.stub(:error_message, nil) do
              delete "/api/v1/settings/payment_methods/pm_other", headers: auth_headers
            end
          end
        end
        assert_response :unprocessable_entity
        assert_match(/does not belong/i, JSON.parse(response.body)["error"])
      end
    end
  end
end
