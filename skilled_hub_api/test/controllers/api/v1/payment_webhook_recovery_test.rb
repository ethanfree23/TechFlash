# frozen_string_literal: true

require "test_helper"
require "ostruct"

module Api
  module V1
    # Signed payment_intent.* webhooks recovering local collection state, with ownership checks,
    # duplicate delivery, and out-of-order permutations.
    class PaymentWebhookRecoveryTest < ActionDispatch::IntegrationTest
      WEBHOOK_PATH = "/api/v1/stripe/webhook"
      PM_META = { payment_method_id: "pm_bank", payment_method_type: "us_bank_account", payment_method_last4: "6789", payment_method_bank_name: "Chase" }.freeze

      setup do
        @company_user = User.create!(email: "wh-rec-#{SecureRandom.hex(3)}@example.com", password: "password123",
                                     password_confirmation: "password123", role: :company)
        @company_user.update_column(:stripe_customer_id, "cus_wh_rec")
        @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
        @company_user.update_column(:company_profile_id, @company_profile.id)
        @job = Job.create!(
          company_profile: @company_profile, title: "Recovery job", description: "desc",
          status: :pending_funding, funding_status: :adjustment_required,
          hourly_rate_cents: 5000, hours_per_day: 8, days: 2, company_commission_percent_snapshot: 10,
          agreed_labor_cents: 80_000, financial_revision: 1
        )
        @payment = @job.payments.create!(amount_cents: 88_000, status: "pending", transfer_group: @job.transfer_group, currency: "usd")
        @txn = JobPaymentTransaction.create!(
          payment: @payment, job: @job, transaction_type: :initial_job_charge, direction: :inbound,
          amount_cents: 88_000, currency: "usd", status: :outcome_unknown, idempotency_key: "tf_wh_rec_#{@job.id}",
          revision: 1, collection_first_attempted_at: 1.minute.ago, investigation_required: true, metadata_json: {}
        )
        @seq = 0
      end

      def intent(status:, id: "pi_rec_1", overrides: {})
        OpenStruct.new({
          id: id, object: "payment_intent", status: status, amount: 88_000, currency: "usd", customer: "cus_wh_rec",
          latest_charge: (status == "succeeded" ? "ch_rec_1" : nil), payment_method: "pm_bank", last_payment_error: nil,
          metadata: { "transaction_id" => @txn.id.to_s, "job_id" => @job.id.to_s, "payment_id" => @payment.id.to_s }
        }.merge(overrides))
      end

      def deliver(type, object, event_id: nil, times: 1, livemode: nil)
        @seq += 1
        event_id ||= "evt_rec_#{@seq}"
        event = OpenStruct.new(id: event_id, type: type, created: Time.now.to_i, livemode: livemode, data: OpenStruct.new(object: object))
        JobStripeOps.stub(:payment_method_display, PM_META) do
          JobAlertDispatcher.stub(:dispatch_for_job, true) do
            with_stubbed_stripe_webhook(event) do
              times.times do
                post WEBHOOK_PATH, params: { id: event_id, type: type }.to_json,
                                   headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "t" }
                assert_response :ok
              end
            end
          end
        end
      end

      def assert_not_funded
        @job.reload
        refute @job.funding_funded?
        refute @job.open?
        assert_equal 0, JobLedger.for(@job).collected_cents
      end

      test "payment_intent.processing recovers an outcome_unknown collection to processing without funding" do
        deliver("payment_intent.processing", intent(status: "processing"), times: 2)
        @txn.reload
        assert @txn.status_processing?
        assert_equal "pi_rec_1", @txn.stripe_payment_intent_id
        refute @txn.investigation_required
        assert_equal "outcome_unknown", @txn.metadata_json["recovered_from"]
        assert_not_funded
        assert @job.pending_funding?
      end

      test "payment_intent.processing recovers a locally failed collection when Stripe proves processing" do
        @txn.update!(status: :failed, error_message: "Timed out", stripe_payment_intent_id: nil)
        @payment.update!(status: "failed")
        @job.update!(funding_status: :funding_failed)

        deliver("payment_intent.processing", intent(status: "processing"))
        @txn.reload
        assert @txn.status_processing?
        assert_nil @txn.error_message
        assert_equal "pending", @payment.reload.status
        assert_not_funded
        assert @job.funding_adjustment_required?
      end

      test "payment_intent.processing is not applied when the Stripe object is not actually processing" do
        deliver("payment_intent.processing", intent(status: "requires_payment_method"))
        assert @txn.reload.status_outcome_unknown?
      end

      test "payment_intent.succeeded after unknown funds and publishes exactly once under duplicates" do
        deliver("payment_intent.succeeded", intent(status: "succeeded"), times: 3)
        @txn.reload
        assert @txn.status_succeeded?
        assert_equal "ch_rec_1", @txn.stripe_charge_id
        @job.reload
        assert @job.open?
        assert @job.funding_funded?
        assert JobLedger.for(@job).fully_funded
        assert_equal 1, @job.job_financial_revisions.where(revision_number: 1).count
        assert_equal "held", @payment.reload.status
      end

      test "succeeded then delayed processing never downgrades" do
        deliver("payment_intent.succeeded", intent(status: "succeeded"))
        deliver("payment_intent.processing", intent(status: "processing"))
        assert @txn.reload.status_succeeded?
        assert @job.reload.funding_funded?
      end

      test "local failure then verified later success recovers to succeeded" do
        @txn.update!(status: :failed, error_message: "misclassified", stripe_payment_intent_id: nil)
        @job.update!(funding_status: :funding_failed)
        deliver("payment_intent.succeeded", intent(status: "succeeded"))
        assert @txn.reload.status_succeeded?
        assert @job.reload.funding_funded?
        assert @job.open?
      end

      test "processing then succeeded, and succeeded then processing then failed, converge on succeeded" do
        deliver("payment_intent.processing", intent(status: "processing"))
        deliver("payment_intent.succeeded", intent(status: "succeeded"))
        assert @txn.reload.status_succeeded?

        deliver("payment_intent.processing", intent(status: "processing"))
        failed = intent(status: "requires_payment_method", overrides: { last_payment_error: OpenStruct.new(message: "R01") })
        deliver("payment_intent.payment_failed", failed)
        assert @txn.reload.status_succeeded?, "post-success failure signal must not downgrade"
        assert @txn.investigation_required
        assert PaymentRiskEvent.exists?(correlation_key: "unconfirmed_pi:pi_rec_1")
      end

      test "payment_failed with a non-definitive Stripe status does not close an unknown attempt" do
        deliver("payment_intent.payment_failed", intent(status: "processing"))
        @txn.reload
        assert @txn.status_outcome_unknown?
        assert @txn.metadata_json["non_definitive_failure_signal"].present?
      end

      test "definitive payment_failed closes an unknown attempt as failed" do
        failed = intent(status: "requires_payment_method", overrides: { last_payment_error: OpenStruct.new(message: "Insufficient funds") })
        deliver("payment_intent.payment_failed", failed, times: 2)
        @txn.reload
        assert @txn.status_failed?
        assert_equal "Insufficient funds", @txn.error_message
        assert_equal "pi_rec_1", @txn.stripe_payment_intent_id
        assert @job.reload.funding_funding_failed?
        assert_equal 1, PaymentRiskEvent.where(correlation_key: "pre_fail:pi_rec_1").count
      end

      test "webhook before API response: processing lands first, then the failed API result cannot downgrade it" do
        @txn.update!(status: :pending)
        deliver("payment_intent.processing", intent(status: "processing"))
        assert @txn.reload.status_processing?

        late_api = JobStripeOps::Result.new(status: "failed", error: "Timed out (late)")
        result = JobFundingService.finalize_collection!(job: @job, payment: @payment, txn: @txn, result: late_api)
        assert result[:processing]
        assert @txn.reload.status_processing?
        assert_equal "failed", @txn.metadata_json.dig("api_result_after_webhook", "status")
      end

      test "wrong amount / currency / customer / company metadata is rejected and flagged" do
        [
          { amount: 88_001 },
          { currency: "eur" },
          { customer: "cus_other" },
          { metadata: { "transaction_id" => @txn.id.to_s, "job_id" => (@job.id + 999).to_s } }
        ].each do |overrides|
          deliver("payment_intent.succeeded", intent(status: "succeeded", overrides: overrides))
          @txn.reload
          assert @txn.status_outcome_unknown?, "should reject #{overrides.inspect}"
          assert @txn.metadata_json["webhook_mismatch"].present?
          assert_not_funded
        end
      end

      test "metadata pointing at a different transaction id than the stored PaymentIntent is rejected" do
        @txn.update!(stripe_payment_intent_id: "pi_rec_1")
        other = intent(status: "succeeded", overrides: { metadata: { "transaction_id" => (@txn.id + 1000).to_s } })
        deliver("payment_intent.succeeded", other)
        assert @txn.reload.status_outcome_unknown?
      end

      test "ACH processing is never funded and never authorizes work or transfers" do
        deliver("payment_intent.processing", intent(status: "processing"))
        assert_not_funded
        @job.update!(technician_commission_percent_snapshot: 10)
        result = PaymentService.release_to_technician(@payment)
        assert result[:error].present?
        assert_equal 0, @job.job_payment_transactions.where(transaction_type: :technician_transfer).count
      end

      test "verified ACH return after success is layered on the success without inventing a pre-success failure" do
        deliver("payment_intent.succeeded", intent(status: "succeeded"))
        dispute = OpenStruct.new(id: "dp_rec_1", charge: "ch_rec_1", payment_intent: "pi_rec_1", status: "lost",
                                 reason: "insufficient_funds", amount: 88_000)
        deliver("charge.dispute.created", dispute)
        deliver("charge.dispute.closed", dispute)
        @txn.reload
        assert @txn.status_succeeded?
        assert_equal "dp_rec_1", @txn.stripe_dispute_id
        risk = PaymentRiskEvent.find_by(correlation_key: "dispute:dp_rec_1")
        assert risk
        assert_equal "post_success_return", risk.risk_kind
        refute PaymentRiskEvent.exists?(correlation_key: "pre_fail:pi_rec_1")
        assert PaymentRiskEvent.open_for_job?(@job)
      end

      test "livemode mismatch is ignored in production and staging but accepted when unspecified" do
        Rails.env.stub(:production?, true) do
          deliver("payment_intent.succeeded", intent(status: "succeeded"), livemode: false)
          assert @txn.reload.status_outcome_unknown?
        end
        Rails.env.stub(:staging?, true) do
          deliver("payment_intent.succeeded", intent(status: "succeeded"), livemode: true)
          assert @txn.reload.status_outcome_unknown?
        end
        deliver("payment_intent.succeeded", intent(status: "succeeded"), livemode: false)
        assert @txn.reload.status_succeeded?
      end

      test "internal smoke-test PaymentIntents never reach job funding handlers" do
        smoke = intent(status: "succeeded", id: "pi_smoke_x",
                       overrides: { metadata: { InternalFinancialSmokeTest::METADATA_MARKER => "true", "internal_smoke_test_id" => "ifst_missing",
                                                "transaction_id" => @txn.id.to_s } })
        deliver("payment_intent.succeeded", smoke)
        assert @txn.reload.status_outcome_unknown?
        assert_not_funded
      end

      test "job create with an ambiguous Stripe result returns 202 payment_outcome_unknown, holds the job, and re-posting does not re-debit" do
        unknown = JobStripeOps::Result.new(status: "outcome_unknown", error: "timeout", error_class: "Stripe::APIConnectionError")
        creates = 0
        token = JWT.encode({ user_id: @company_user.id }, Rails.application.secret_key_base, "HS256")
        headers = { "Authorization" => "Bearer #{token}" }
        params = { title: "Unknown outcome job", description: "desc", status: "open", hourly_rate_cents: 5000,
                   hours_per_day: 8, days: 1, skill_class: "Journeyman" }

        PaymentService.stub(:company_has_payment_method?, true) do
          JobStripeOps.stub(:create_payment_intent!, ->(**_kw) { creates += 1; unknown }) do
            post "/api/v1/jobs", params: params, headers: headers, as: :json
          end
        end
        assert_response :accepted
        body = JSON.parse(response.body)
        assert_equal true, body["payment_outcome_unknown"]
        assert_equal "payment_outcome_unknown", body["code"]
        assert_match(/Do not re-post/, body["message"])
        job = Job.find(body.dig("job", "id"))
        assert job.pending_funding?
        refute job.funding_funded?
        assert_equal 1, creates
        txn = job.job_payment_transactions.initial_job_charge.last
        assert txn.status_outcome_unknown?

        # Re-running funding for the same job never creates a second debit while unknown.
        lookup_failed = JobStripeOps::PaymentIntentLookupResult.new(status: "lookup_failed", error: "timeout")
        JobStripeOps.stub(:create_payment_intent!, ->(**_kw) { creates += 1; unknown }) do
          JobStripeOps.stub(:find_payment_intent_for_attempt, lookup_failed) do
            result = JobFundingService.fund_for_publish!(job.reload)
            assert result[:outcome_unknown]
          end
        end
        assert_equal 1, creates
        assert_equal 1, job.job_payment_transactions.initial_job_charge.count
      end

      private

      def with_stubbed_stripe_webhook(event)
        old_secret = ENV["STRIPE_WEBHOOK_SECRET"]
        ENV["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
        webhook_singleton = Stripe::Webhook.singleton_class
        original_construct = Stripe::Webhook.method(:construct_event)
        webhook_singleton.send(:define_method, :construct_event) { |_payload, _sig, _secret| event }
        yield
      ensure
        webhook_singleton.send(:define_method, :construct_event, original_construct)
        ENV["STRIPE_WEBHOOK_SECRET"] = old_secret
      end
    end
  end
end
