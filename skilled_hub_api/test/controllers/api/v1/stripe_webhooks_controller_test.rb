require "test_helper"
require "ostruct"

module Api
  module V1
    class StripeWebhooksControllerTest < ActionDispatch::IntegrationTest
      test "checkout.session.completed payment marks background check paid" do
        user = User.create!(
          email: "stripe-bg-webhook@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic")
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :not_started,
          payment_status: :pending,
          paid_by: "technician"
        )

        payload = { id: "evt_test_123", type: "checkout.session.completed" }.to_json
        event = OpenStruct.new(
          id: "evt_test_123",
          type: "checkout.session.completed",
          data: OpenStruct.new(
            object: OpenStruct.new(
              mode: "payment",
              id: "cs_test_webhook",
              payment_intent: "pi_test_webhook",
              metadata: { "background_check_id" => check.id.to_s }
            )
          )
        )

        with_stubbed_stripe_webhook(event) do
          post "/api/v1/stripe/webhook",
               params: payload,
               headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
        end

        assert_response :ok
        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "pi_test_webhook", check.stripe_payment_intent_id
      end

      test "duplicate stripe webhook event is idempotent" do
        user = User.create!(
          email: "stripe-bg-webhook-idempotent@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic")
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :not_started,
          payment_status: :pending,
          paid_by: "technician"
        )

        payload = { id: "evt_test_idempotent_1", type: "checkout.session.completed" }.to_json
        event = OpenStruct.new(
          id: "evt_test_idempotent_1",
          type: "checkout.session.completed",
          data: OpenStruct.new(
            object: OpenStruct.new(
              mode: "payment",
              id: "cs_test_webhook_2",
              payment_intent: "pi_test_webhook_2",
              metadata: { "background_check_id" => check.id.to_s }
            )
          )
        )

        launch_calls = 0
        with_stubbed_stripe_webhook(event, launch_counter: -> { launch_calls += 1 }) do
          2.times do
            post "/api/v1/stripe/webhook",
                 params: payload,
                 headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
            assert_response :ok
          end
        end

        check.reload
        assert_equal "paid", check.payment_status
        assert_equal 1, StripeWebhookEvent.where(stripe_event_id: "evt_test_idempotent_1").count
        assert_equal 1, launch_calls
      end

      private

      def with_stubbed_stripe_webhook(event, launch_counter: nil)
        old_secret = ENV["STRIPE_WEBHOOK_SECRET"]
        ENV["STRIPE_WEBHOOK_SECRET"] = "whsec_test"

        webhook_singleton = Stripe::Webhook.singleton_class
        launch_singleton = BackgroundCheckStartService.singleton_class
        original_construct = Stripe::Webhook.method(:construct_event)
        original_launch = BackgroundCheckStartService.method(:launch_checkr_invitation!)

        webhook_singleton.send(:define_method, :construct_event) do |_payload, _sig, _secret|
          event
        end
        launch_singleton.send(:define_method, :launch_checkr_invitation!) do |check|
          launch_counter&.call
          check.update!(status: :invited, provider_invitation_id: "inv_test_1")
          { "id" => "inv_test_1" }
        end
        yield
      ensure
        webhook_singleton.send(:define_method, :construct_event, original_construct)
        launch_singleton.send(:define_method, :launch_checkr_invitation!, original_launch)
        ENV["STRIPE_WEBHOOK_SECRET"] = old_secret
      end
    end
  end
end
