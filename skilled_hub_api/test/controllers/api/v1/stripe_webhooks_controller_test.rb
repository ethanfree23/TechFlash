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

      test "missing webhook secret in production returns 500" do
        old_secret = ENV["STRIPE_WEBHOOK_SECRET"]
        ENV["STRIPE_WEBHOOK_SECRET"] = nil
        Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
          post "/api/v1/stripe/webhook",
               params: { id: "evt_missing_secret" }.to_json,
               headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
        end
        assert_response :internal_server_error
      ensure
        ENV["STRIPE_WEBHOOK_SECRET"] = old_secret
      end

      test "charge.refunded writes a refund ledger row once" do
        company_user = User.create!(email: "wh-refund-co-#{SecureRandom.hex(3)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)
        job = Job.create!(
          company_profile: company_profile,
          title: "Refund webhook job",
          description: "desc",
          status: :open,
          hourly_rate_cents: 5000,
          hours_per_day: 1,
          days: 1
        )
        payment = job.payments.create!(amount_cents: 5500, status: "held", transfer_group: job.transfer_group, currency: "usd")
        JobPaymentTransaction.create!(
          payment: payment,
          job: job,
          transaction_type: :initial_job_charge,
          direction: :inbound,
          amount_cents: 5500,
          currency: "usd",
          status: :succeeded,
          stripe_payment_intent_id: "pi_refund_wh",
          stripe_charge_id: "ch_refund_wh",
          idempotency_key: "tf_wh_#{job.id}_initial",
          revision: 1,
          succeeded_at: Time.current
        )

        refund = OpenStruct.new(id: "re_wh_1", amount: 2000, currency: "usd")
        charge = OpenStruct.new(
          id: "ch_refund_wh",
          payment_intent: "pi_refund_wh",
          refunds: OpenStruct.new(data: [refund])
        )
        event = OpenStruct.new(id: "evt_charge_refunded_1", type: "charge.refunded", data: OpenStruct.new(object: charge))
        payload = { id: "evt_charge_refunded_1", type: "charge.refunded" }.to_json

        with_stubbed_stripe_webhook(event) do
          post "/api/v1/stripe/webhook",
               params: payload,
               headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
          post "/api/v1/stripe/webhook",
               params: payload,
               headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
        end

        assert_response :ok
        assert_equal 1, JobPaymentTransaction.where(stripe_refund_id: "re_wh_1").count
        assert_equal 2000, JobPaymentTransaction.find_by(stripe_refund_id: "re_wh_1").amount_cents
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
