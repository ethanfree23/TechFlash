# frozen_string_literal: true

require "test_helper"
require "ostruct"

module Api
  module V1
    class AchWebhooksTest < ActionDispatch::IntegrationTest
      setup do
        @company_user = User.create!(
          email: "ach-wh-#{SecureRandom.hex(3)}@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :company
        )
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
        @company_user.update_column(:company_profile_id, @company_profile.id)
        @job = Job.create!(
          company_profile: @company_profile,
          title: "ACH webhook job",
          description: "desc",
          status: :pending_funding,
          funding_status: :adjustment_required,
          hourly_rate_cents: 5000,
          hours_per_day: 8,
          days: 2,
          company_commission_percent_snapshot: 10,
          agreed_labor_cents: 80_000,
          financial_revision: 1
        )
        @payment = @job.payments.create!(amount_cents: 88_000, status: "pending", transfer_group: @job.transfer_group, currency: "usd")
        @txn = JobPaymentTransaction.create!(
          payment: @payment,
          job: @job,
          transaction_type: :initial_job_charge,
          direction: :inbound,
          amount_cents: 88_000,
          currency: "usd",
          status: :processing,
          payment_method_type: "us_bank_account",
          payment_method_last4: "6789",
          payment_method_bank_name: "Chase",
          stripe_payment_intent_id: "pi_ach_wh_1",
          idempotency_key: "tf_wh_ach_#{@job.id}",
          revision: 1,
          processing_at: Time.current
        )
      end

      test "payment_intent.processing is idempotent and keeps job unpublished" do
        intent = OpenStruct.new(
          id: "pi_ach_wh_1",
          status: "processing",
          latest_charge: nil,
          payment_method: "pm_bank",
          metadata: {}
        )
        event = OpenStruct.new(id: "evt_ach_processing_1", type: "payment_intent.processing", livemode: false, data: OpenStruct.new(object: intent))
        payload = { id: "evt_ach_processing_1", type: "payment_intent.processing" }.to_json

        JobStripeOps.stub(:payment_method_display, {
          payment_method_id: "pm_bank",
          payment_method_type: "us_bank_account",
          payment_method_last4: "6789",
          payment_method_bank_name: "Chase"
        }) do
          with_stubbed_stripe_webhook(event) do
            2.times do
              post "/api/v1/stripe/webhook",
                   params: payload,
                   headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
              assert_response :ok
            end
          end
        end

        assert_equal 1, StripeWebhookEvent.where(stripe_event_id: "evt_ach_processing_1").count
        @job.reload
        assert @job.pending_funding?
        assert @txn.reload.status_processing?
      end

      test "payment_intent.succeeded from processing publishes job once" do
        intent = OpenStruct.new(
          id: "pi_ach_wh_1",
          status: "succeeded",
          latest_charge: "ch_ach_wh_1",
          payment_method: "pm_bank",
          metadata: { "transaction_id" => @txn.id.to_s }
        )
        event = OpenStruct.new(id: "evt_ach_succeeded_1", type: "payment_intent.succeeded", livemode: false, data: OpenStruct.new(object: intent))
        payload = { id: "evt_ach_succeeded_1", type: "payment_intent.succeeded" }.to_json

        JobStripeOps.stub(:payment_method_display, {
          payment_method_id: "pm_bank",
          payment_method_type: "us_bank_account",
          payment_method_last4: "6789",
          payment_method_bank_name: "Chase"
        }) do
          JobAlertDispatcher.stub(:dispatch_for_job, true) do
            with_stubbed_stripe_webhook(event) do
              2.times do
                post "/api/v1/stripe/webhook",
                     params: payload,
                     headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
                assert_response :ok
              end
            end
          end
        end

        @job.reload
        assert @job.open?
        assert @job.funding_funded?
        assert @txn.reload.status_succeeded?
        assert_equal 1, StripeWebhookEvent.where(stripe_event_id: "evt_ach_succeeded_1").count
      end

      test "charge.dispute.created marks transaction for admin attention" do
        @txn.update!(status: :succeeded, succeeded_at: Time.current, stripe_charge_id: "ch_dispute_1")
        dispute = OpenStruct.new(
          id: "dp_1",
          charge: "ch_dispute_1",
          payment_intent: "pi_ach_wh_1",
          status: "needs_response",
          reason: "insufficient_funds",
          amount: 88_000
        )
        event = OpenStruct.new(id: "evt_dispute_1", type: "charge.dispute.created", livemode: false, data: OpenStruct.new(object: dispute))
        payload = { id: "evt_dispute_1", type: "charge.dispute.created" }.to_json

        with_stubbed_stripe_webhook(event) do
          post "/api/v1/stripe/webhook",
               params: payload,
               headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "test" }
        end

        assert_response :ok
        @txn.reload
        assert_equal "needs_response", @txn.dispute_status
        assert_equal "dp_1", @txn.stripe_dispute_id
        assert @txn.disputed?
      end

      private

      def with_stubbed_stripe_webhook(event)
        old_secret = ENV["STRIPE_WEBHOOK_SECRET"]
        ENV["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
        webhook_singleton = Stripe::Webhook.singleton_class
        original_construct = Stripe::Webhook.method(:construct_event)
        webhook_singleton.send(:define_method, :construct_event) do |_payload, _sig, _secret|
          event
        end
        yield
      ensure
        webhook_singleton.send(:define_method, :construct_event, original_construct)
        ENV["STRIPE_WEBHOOK_SECRET"] = old_secret
      end
    end
  end
end
