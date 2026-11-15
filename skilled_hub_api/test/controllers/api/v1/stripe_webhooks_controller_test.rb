require "test_helper"

module Api
  module V1
    # Requests are signed with real Stripe signatures (Stripe::Webhook::Signature) so verification is
    # exercised end to end; payloads mirror the shapes Stripe sends for each event type.
    class StripeWebhooksControllerTest < ActionDispatch::IntegrationTest
      WEBHOOK_PATH = "/api/v1/stripe/webhook".freeze
      PLATFORM_SECRET = "whsec_test_platform_#{SecureRandom.hex(8)}".freeze
      CONNECT_SECRET = "whsec_test_connect_#{SecureRandom.hex(8)}".freeze

      setup do
        @env_before = ENV.to_h.slice("STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET")
        ENV["STRIPE_WEBHOOK_SECRET"] = PLATFORM_SECRET
        ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
      end

      teardown do
        %w[STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET].each do |key|
          if @env_before.key?(key)
            ENV[key] = @env_before[key]
          else
            ENV.delete(key)
          end
        end
      end

      # ------------------------------------------------------------------
      # Signature verification / multiple signing secrets
      # ------------------------------------------------------------------

      test "valid platform signature is accepted and the event is persisted" do
        event = unhandled_event("evt_sig_platform_ok")
        assert_difference -> { StripeWebhookEvent.count }, 1 do
          post_stripe_event(event, secret: PLATFORM_SECRET)
        end
        assert_response :ok
        assert StripeWebhookEvent.find_by(stripe_event_id: "evt_sig_platform_ok").processed_at.present?
      end

      test "valid Connect signature is accepted when STRIPE_CONNECT_WEBHOOK_SECRET is configured" do
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = CONNECT_SECRET
        event = unhandled_event("evt_sig_connect_ok", account: "acct_connect_sig")
        assert_difference -> { StripeWebhookEvent.count }, 1 do
          post_stripe_event(event, secret: CONNECT_SECRET)
        end
        assert_response :ok
      end

      test "platform signature still verifies when the Connect secret is unset" do
        ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
        post_stripe_event(unhandled_event("evt_sig_platform_only"), secret: PLATFORM_SECRET)
        assert_response :ok
      end

      test "Connect-signed event is rejected when only the platform secret is configured" do
        ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
        assert_no_difference -> { StripeWebhookEvent.count } do
          post_stripe_event(unhandled_event("evt_sig_connect_unconfigured"), secret: CONNECT_SECRET)
        end
        assert_response :bad_request
      end

      test "blank Connect secret is not a candidate" do
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "   "
        post_stripe_event(unhandled_event("evt_sig_blank_connect_bad"), secret: CONNECT_SECRET)
        assert_response :bad_request
        post_stripe_event(unhandled_event("evt_sig_blank_connect_ok"), secret: PLATFORM_SECRET)
        assert_response :ok
      end

      test "only the Connect secret configured still verifies Connect-signed events" do
        ENV.delete("STRIPE_WEBHOOK_SECRET")
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = CONNECT_SECRET
        post_stripe_event(unhandled_event("evt_sig_connect_only_bad"), secret: PLATFORM_SECRET)
        assert_response :bad_request
        post_stripe_event(unhandled_event("evt_sig_connect_only_ok"), secret: CONNECT_SECRET)
        assert_response :ok
      end

      test "invalid signature returns 400 and persists nothing" do
        assert_no_difference -> { StripeWebhookEvent.count } do
          post_stripe_event(unhandled_event("evt_sig_invalid"), secret: "whsec_wrong_secret")
        end
        assert_response :bad_request
        assert_nil StripeWebhookEvent.find_by(stripe_event_id: "evt_sig_invalid")
      end

      test "missing or garbage signature header returns 400" do
        payload = unhandled_event("evt_sig_missing").to_json
        post WEBHOOK_PATH, params: payload, headers: { "Content-Type" => "application/json" }
        assert_response :bad_request
        post WEBHOOK_PATH, params: payload, headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => "t=1,v1=deadbeef" }
        assert_response :bad_request
        assert_nil StripeWebhookEvent.find_by(stripe_event_id: "evt_sig_missing")
      end

      test "malformed payload with a valid signature returns 400 and persists nothing" do
        assert_no_difference -> { StripeWebhookEvent.count } do
          post_stripe_event(nil, secret: PLATFORM_SECRET, payload: "{not json")
        end
        assert_response :bad_request
      end

      test "missing webhook secret in production returns 500" do
        ENV.delete("STRIPE_WEBHOOK_SECRET")
        ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
        Rails.stub(:env, ActiveSupport::StringInquirer.new("production")) do
          post_stripe_event(unhandled_event("evt_missing_secret"), secret: PLATFORM_SECRET)
        end
        assert_response :internal_server_error
        assert_nil StripeWebhookEvent.find_by(stripe_event_id: "evt_missing_secret")
      end

      test "missing webhook secret outside production is skipped with 503" do
        ENV.delete("STRIPE_WEBHOOK_SECRET")
        ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
        post_stripe_event(unhandled_event("evt_missing_secret_dev"), secret: PLATFORM_SECRET)
        assert_response :service_unavailable
        assert_nil StripeWebhookEvent.find_by(stripe_event_id: "evt_missing_secret_dev")
      end

      # ------------------------------------------------------------------
      # account.updated (Connect destination)
      # ------------------------------------------------------------------

      test "account.updated syncs only the technician owning that account" do
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = CONNECT_SECRET
        target = create_technician(stripe_account_id: "acct_target_1")
        other = create_technician(stripe_account_id: "acct_other_2")

        synced = []
        StripeConnectAccountService.stub(:sync!, ->(profile) { synced << profile.id; profile }) do
          post_stripe_event(
            stripe_event(id: "evt_acct_updated_1", type: "account.updated", object: account_object("acct_target_1"), account: "acct_target_1"),
            secret: CONNECT_SECRET
          )
        end

        assert_response :ok
        assert_equal [target.id], synced
        assert_not_includes synced, other.id
      end

      test "account.updated whose object does not match the event account is ignored" do
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = CONNECT_SECRET
        create_technician(stripe_account_id: "acct_victim_1")

        synced = []
        StripeConnectAccountService.stub(:sync!, ->(profile) { synced << profile.id; profile }) do
          post_stripe_event(
            stripe_event(id: "evt_acct_mismatch", type: "account.updated", object: account_object("acct_victim_1"), account: "acct_attacker_9"),
            secret: CONNECT_SECRET
          )
        end

        assert_response :ok
        assert_empty synced
      end

      test "account.updated for an unknown account is a no-op" do
        synced = []
        StripeConnectAccountService.stub(:sync!, ->(profile) { synced << profile.id; profile }) do
          post_stripe_event(stripe_event(id: "evt_acct_unknown", type: "account.updated", object: account_object("acct_nobody")))
        end
        assert_response :ok
        assert_empty synced
      end

      test "connected-account events other than account.updated never touch the platform ledger" do
        ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = CONNECT_SECRET
        job, _payment, collection = create_funded_job(pi_id: "pi_connect_leak", charge_id: "ch_connect_leak")

        charge = charge_object(id: "ch_connect_leak", payment_intent: "pi_connect_leak", refunds: [refund_object(id: "re_connect_leak", amount: 1000, charge: "ch_connect_leak", payment_intent: "pi_connect_leak")])
        post_stripe_event(
          stripe_event(id: "evt_connect_refund", type: "charge.refunded", object: charge, account: "acct_some_tech"),
          secret: CONNECT_SECRET
        )

        assert_response :ok
        assert_equal 0, JobPaymentTransaction.where(stripe_refund_id: "re_connect_leak").count
        assert_equal [collection.id], job.job_payment_transactions.pluck(:id)
      end

      # ------------------------------------------------------------------
      # Background-check Checkout fulfillment
      # ------------------------------------------------------------------

      test "checkout.session.completed with payment_status paid marks paid and launches Checkr once" do
        check = create_pending_background_check(session_id: "cs_paid_1")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_cs_paid_1", "checkout.session.completed", check, session_id: "cs_paid_1", payment_status: "paid", payment_intent: "pi_cs_paid_1"))
        end

        assert_response :ok
        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "pi_cs_paid_1", check.stripe_payment_intent_id
        assert_equal "cs_paid_1", check.stripe_checkout_session_id
        assert check.paid_at.present?
        assert_equal "invited", check.status
        assert_equal "inv_test_1", check.provider_invitation_id
        assert_equal 1, launches.size
      end

      test "checkout.session.completed with payment_status unpaid does not mark paid or launch Checkr" do
        check = create_pending_background_check(session_id: "cs_unpaid_1")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_cs_unpaid_1", "checkout.session.completed", check, session_id: "cs_unpaid_1", payment_status: "unpaid", payment_intent: "pi_cs_unpaid_1"))
        end

        assert_response :ok
        check.reload
        assert_equal "pending", check.payment_status
        assert_equal "not_started", check.status
        assert_nil check.paid_at
        assert_nil check.provider_invitation_id
        assert_empty launches
        assert StripeWebhookEvent.find_by(stripe_event_id: "evt_cs_unpaid_1").processed_at.present?
      end

      test "checkout.session.async_payment_succeeded fulfills a background check once" do
        check = create_pending_background_check(session_id: "cs_async_1")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_cs_async_ok_1", "checkout.session.async_payment_succeeded", check, session_id: "cs_async_1", payment_status: "paid", payment_intent: "pi_cs_async_1"))
        end

        assert_response :ok
        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "pi_cs_async_1", check.stripe_payment_intent_id
        assert_equal 1, launches.size
      end

      test "checkout.session.async_payment_failed never launches Checkr and marks a pending check failed" do
        check = create_pending_background_check(session_id: "cs_async_fail_1")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_cs_async_fail_1", "checkout.session.async_payment_failed", check, session_id: "cs_async_fail_1", payment_status: "unpaid", payment_intent: "pi_cs_async_fail_1"))
        end

        assert_response :ok
        check.reload
        assert_equal "failed", check.payment_status
        assert_equal "not_started", check.status
        assert_nil check.paid_at
        assert_empty launches
      end

      test "completed unpaid then async_payment_succeeded launches exactly once" do
        check = create_pending_background_check(session_id: "cs_unpaid_then_ok")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_unpaid_then_ok_1", "checkout.session.completed", check, session_id: "cs_unpaid_then_ok", payment_status: "unpaid"))
          post_stripe_event(checkout_event("evt_unpaid_then_ok_2", "checkout.session.async_payment_succeeded", check, session_id: "cs_unpaid_then_ok", payment_status: "paid", payment_intent: "pi_unpaid_then_ok"))
        end

        assert_equal "paid", check.reload.payment_status
        assert_equal 1, launches.size
      end

      test "completed paid followed by async_payment_succeeded launches exactly once" do
        check = create_pending_background_check(session_id: "cs_paid_then_async")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_paid_then_async_1", "checkout.session.completed", check, session_id: "cs_paid_then_async", payment_status: "paid"))
          post_stripe_event(checkout_event("evt_paid_then_async_2", "checkout.session.async_payment_succeeded", check, session_id: "cs_paid_then_async", payment_status: "paid"))
        end

        assert_equal "paid", check.reload.payment_status
        assert_equal 1, launches.size
      end

      test "duplicate async_payment_succeeded deliveries launch exactly once" do
        check = create_pending_background_check(session_id: "cs_dup_async")
        same_event = checkout_event("evt_dup_async_1", "checkout.session.async_payment_succeeded", check, session_id: "cs_dup_async", payment_status: "paid")
        redelivered_as_new_id = checkout_event("evt_dup_async_2", "checkout.session.async_payment_succeeded", check, session_id: "cs_dup_async", payment_status: "paid")
        launches = stub_checkr_launch do
          post_stripe_event(same_event)
          post_stripe_event(same_event)
          post_stripe_event(redelivered_as_new_id)
        end

        assert_response :ok
        assert_equal "paid", check.reload.payment_status
        assert_equal 1, launches.size
        assert_equal 1, StripeWebhookEvent.where(stripe_event_id: "evt_dup_async_1").count
      end

      test "async_payment_failed after success does not undo paid state" do
        check = create_pending_background_check(session_id: "cs_fail_after_ok")
        launches = stub_checkr_launch do
          post_stripe_event(checkout_event("evt_fail_after_ok_1", "checkout.session.async_payment_succeeded", check, session_id: "cs_fail_after_ok", payment_status: "paid"))
          post_stripe_event(checkout_event("evt_fail_after_ok_2", "checkout.session.async_payment_failed", check, session_id: "cs_fail_after_ok", payment_status: "unpaid"))
        end

        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "invited", check.status
        assert_equal 1, launches.size
      end

      test "async_payment_failed for a different session than the one on the check leaves it pending" do
        check = create_pending_background_check(session_id: "cs_current_session")
        stub_checkr_launch do
          post_stripe_event(checkout_event("evt_fail_other_session", "checkout.session.async_payment_failed", check, session_id: "cs_stale_session", payment_status: "unpaid"))
        end
        assert_equal "pending", check.reload.payment_status
      end

      test "Checkr launch failure keeps the payment recorded, leaves the check retryable and returns 500 so Stripe retries" do
        check = create_pending_background_check(session_id: "cs_checkr_fail")
        failing = ->(_check) { raise BackgroundCheckStartService::Error, "Checkr is not configured." }
        BackgroundCheckStartService.stub(:launch_checkr_invitation!, failing) do
          post_stripe_event(checkout_event("evt_checkr_fail", "checkout.session.completed", check, session_id: "cs_checkr_fail", payment_status: "paid"))
        end

        assert_response :internal_server_error
        check.reload
        assert_equal "paid", check.payment_status
        assert check.paid_at.present?
        assert_nil check.provider_invitation_id
        assert_equal "failed", check.status
        assert_match(/Checkr is not configured/, check.admin_notes)
        assert_includes BackgroundCheckFulfillmentService.awaiting_invitation.pluck(:id), check.id
        # Event stays unprocessed so the redelivery is not short-circuited as a duplicate.
        assert_nil StripeWebhookEvent.find_by(stripe_event_id: "evt_checkr_fail").processed_at
      end

      test "Checkr raises then succeeds on the redelivered event: exactly one invitation, no second payment write" do
        check = create_pending_background_check(session_id: "cs_checkr_retry")
        event = checkout_event("evt_checkr_retry", "checkout.session.completed", check, session_id: "cs_checkr_retry", payment_status: "paid", payment_intent: "pi_checkr_retry")

        calls = 0
        flaky = lambda do |c|
          calls += 1
          raise BackgroundCheckStartService::Error, "Checkr timeout" if calls == 1

          c.update!(status: :invited, provider_invitation_id: "inv_retry_1")
          { "id" => "inv_retry_1" }
        end

        BackgroundCheckStartService.stub(:launch_checkr_invitation!, flaky) do
          post_stripe_event(event)
          assert_response :internal_server_error
          first_paid_at = check.reload.paid_at
          assert first_paid_at.present?

          post_stripe_event(event)
          assert_response :ok
          check.reload
          assert_equal first_paid_at.to_i, check.paid_at.to_i
        end

        assert_equal 2, calls
        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "invited", check.status
        assert_equal "inv_retry_1", check.provider_invitation_id
        assert StripeWebhookEvent.find_by(stripe_event_id: "evt_checkr_retry").processed_at.present?
        assert_empty BackgroundCheckFulfillmentService.awaiting_invitation.where(id: check.id)
      end

      test "payment notification raising does not block the invitation" do
        check = create_pending_background_check(session_id: "cs_notify_fail")
        exploding = ->(_user, _check) { raise StandardError, "mailer down" }
        launches = VerificationEventNotifier.stub(:background_payment_completed, exploding) do
          stub_checkr_launch do
            post_stripe_event(checkout_event("evt_notify_fail", "checkout.session.completed", check, session_id: "cs_notify_fail", payment_status: "paid"))
          end
        end

        assert_response :ok
        assert_equal 1, launches.size
        check.reload
        assert_equal "paid", check.payment_status
        assert_equal "inv_test_1", check.provider_invitation_id
      end

      test "duplicate success events after a Checkr failure create exactly one invitation" do
        check = create_pending_background_check(session_id: "cs_dup_after_fail")
        calls = 0
        flaky = lambda do |c|
          calls += 1
          raise BackgroundCheckStartService::Error, "Checkr 503" if calls == 1

          c.update!(status: :invited, provider_invitation_id: "inv_dup_fail_1")
          { "id" => "inv_dup_fail_1" }
        end

        BackgroundCheckStartService.stub(:launch_checkr_invitation!, flaky) do
          post_stripe_event(checkout_event("evt_dup_after_fail_1", "checkout.session.completed", check, session_id: "cs_dup_after_fail", payment_status: "paid"))
          assert_response :internal_server_error
          post_stripe_event(checkout_event("evt_dup_after_fail_2", "checkout.session.async_payment_succeeded", check, session_id: "cs_dup_after_fail", payment_status: "paid"))
          assert_response :ok
          post_stripe_event(checkout_event("evt_dup_after_fail_1", "checkout.session.completed", check, session_id: "cs_dup_after_fail", payment_status: "paid"))
          assert_response :ok
        end

        assert_equal 2, calls
        assert_equal "inv_dup_fail_1", check.reload.provider_invitation_id
      end

      test "paid check with a missing invitation is fulfilled by the retry service exactly once" do
        check = create_pending_background_check(session_id: "cs_rake_retry")
        check.update!(payment_status: :paid, paid_at: Time.current)
        assert_includes BackgroundCheckFulfillmentService.awaiting_invitation.pluck(:id), check.id

        launches = stub_checkr_launch do
          assert_equal :launched, BackgroundCheckFulfillmentService.ensure_invitation!(check.id)
          assert_equal :already_fulfilled, BackgroundCheckFulfillmentService.ensure_invitation!(check.id)
        end

        assert_equal 1, launches.size
        assert_equal "inv_test_1", check.reload.provider_invitation_id
        assert_empty BackgroundCheckFulfillmentService.awaiting_invitation.where(id: check.id)
      end

      test "retry service never launches Checkr for an unpaid check" do
        check = create_pending_background_check(session_id: "cs_unpaid_retry")
        launches = stub_checkr_launch do
          assert_equal :not_eligible, BackgroundCheckFulfillmentService.ensure_invitation!(check.id)
        end
        assert_empty launches
      end

      test "subscription checkout.session.completed still syncs membership and never touches background checks" do
        user = create_technician_user(email: "sub-checkout-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_checkout")
        with_technician_pro_price("price_tech_pro_checkout") do
          subscription = Stripe::Subscription.construct_from(subscription_object(id: "sub_checkout_1", customer: "cus_sub_checkout", status: "active", price_id: "price_tech_pro_checkout"))
          launches = nil
          Stripe::Subscription.stub(:retrieve, subscription) do
            launches = stub_checkr_launch do
              post_stripe_event(stripe_event(
                id: "evt_sub_checkout_1",
                type: "checkout.session.completed",
                object: {
                  id: "cs_sub_1", object: "checkout.session", mode: "subscription", status: "complete",
                  payment_status: "paid", customer: "cus_sub_checkout", subscription: "sub_checkout_1",
                  payment_intent: nil, metadata: { user_id: user.id.to_s, role: "technician", membership_level: "pro" }
                }
              ))
            end
          end

          assert_response :ok
          assert_empty launches
          profile = user.technician_profile.reload
          assert_equal "pro", profile.membership_level
          assert_equal "active", profile.membership_status
          assert_equal "sub_checkout_1", profile.stripe_membership_subscription_id
        end
      end

      # ------------------------------------------------------------------
      # charge.refunded reconciliation
      # ------------------------------------------------------------------

      test "charge.refunded arriving before the app persists the refund id attaches to the pending txn" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_race_1", charge_id: "ch_race_1")

        webhook_during_stripe_call = lambda do |amount_cents:, payment_intent_id:, metadata:, idempotency_key:|
          # Stripe has created the refund and emitted charge.refunded, but refund_slice! has not yet
          # saved stripe_refund_id. metadata.transaction_id is the pending ledger row.
          refund = refund_object(id: "re_race_1", amount: amount_cents, charge: "ch_race_1", payment_intent: payment_intent_id, status: "succeeded", metadata: metadata)
          post_stripe_event(stripe_event(id: "evt_race_1", type: "charge.refunded", object: charge_object(id: "ch_race_1", payment_intent: payment_intent_id, refunds: [refund])))
          assert_response :ok
          JobStripeOps::Result.new(status: "succeeded", stripe_id: "re_race_1")
        end

        result = nil
        JobStripeOps.stub(:refund!, webhook_during_stripe_call) do
          result = JobFundingService.refund_slice!(job: job, amount_cents: 2000, payment_intent_id: "pi_race_1", transaction_type: :refund, revision: job.financial_revision)
        end

        assert result[:success], result.inspect
        refunds = job.job_payment_transactions.company_refunds.to_a
        assert_equal 1, refunds.size
        txn = refunds.first
        assert_equal "re_race_1", txn.stripe_refund_id
        assert txn.status_succeeded?
        assert_equal 2000, txn.amount_cents
        assert_equal "pi_race_1", txn.stripe_payment_intent_id
        assert_equal "ch_race_1", txn.stripe_charge_id
        assert_equal 2000, JobLedger.for(job.reload).refunded_cents
      end

      test "charge.refunded arriving after the app persisted the refund id is a no-op" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_after_1", charge_id: "ch_after_1")
        result = JobFundingService.refund_slice!(job: job, amount_cents: 1500, payment_intent_id: "pi_after_1", transaction_type: :refund, revision: job.financial_revision)
        assert result[:success]
        txn = result[:transaction]
        assert txn.stripe_refund_id.present?

        refund = refund_object(id: txn.stripe_refund_id, amount: 1500, charge: "ch_after_1", payment_intent: "pi_after_1", metadata: { "transaction_id" => txn.id.to_s })
        assert_no_difference -> { JobPaymentTransaction.count } do
          post_stripe_event(stripe_event(id: "evt_after_1", type: "charge.refunded", object: charge_object(id: "ch_after_1", payment_intent: "pi_after_1", refunds: [refund])))
        end
        assert_response :ok
        assert_equal 1500, JobLedger.for(job.reload).refunded_cents
      end

      test "duplicate charge.refunded deliveries do not double count" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_dup_1", charge_id: "ch_dup_1")
        refund = refund_object(id: "re_dup_1", amount: 2000, charge: "ch_dup_1", payment_intent: "pi_dup_1")
        charge = charge_object(id: "ch_dup_1", payment_intent: "pi_dup_1", refunds: [refund])

        post_stripe_event(stripe_event(id: "evt_dup_1", type: "charge.refunded", object: charge))
        post_stripe_event(stripe_event(id: "evt_dup_1", type: "charge.refunded", object: charge))
        post_stripe_event(stripe_event(id: "evt_dup_1b", type: "charge.refunded", object: charge))

        assert_response :ok
        assert_equal 1, JobPaymentTransaction.where(stripe_refund_id: "re_dup_1").count
        assert_equal 2000, JobLedger.for(job.reload).refunded_cents
      end

      test "multiple partial refunds are each recorded once and totals are correct" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_partial_1", charge_id: "ch_partial_1", amount_cents: 10_000)
        re1 = refund_object(id: "re_partial_1", amount: 2000, charge: "ch_partial_1", payment_intent: "pi_partial_1")
        re2 = refund_object(id: "re_partial_2", amount: 1500, charge: "ch_partial_1", payment_intent: "pi_partial_1")

        # Stripe sends one charge.refunded per refund; each carries every refund on the charge so far.
        post_stripe_event(stripe_event(id: "evt_partial_1", type: "charge.refunded", object: charge_object(id: "ch_partial_1", payment_intent: "pi_partial_1", refunds: [re1], amount_refunded: 2000)))
        post_stripe_event(stripe_event(id: "evt_partial_2", type: "charge.refunded", object: charge_object(id: "ch_partial_1", payment_intent: "pi_partial_1", refunds: [re2, re1], amount_refunded: 3500)))

        assert_response :ok
        assert_equal 2, job.job_payment_transactions.company_refunds.count
        assert_equal 3500, JobLedger.for(job.reload).refunded_cents
      end

      test "metadata.transaction_id pointing to a valid pending refund txn attaches instead of inserting" do
        job, payment, _collection = create_funded_job(pi_id: "pi_meta_1", charge_id: "ch_meta_1")
        pending = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_meta_1")

        refund = refund_object(id: "re_meta_1", amount: 2500, charge: "ch_meta_1", payment_intent: "pi_meta_1", metadata: { "transaction_id" => pending.id.to_s })
        assert_no_difference -> { JobPaymentTransaction.count } do
          post_stripe_event(stripe_event(id: "evt_meta_1", type: "charge.refunded", object: charge_object(id: "ch_meta_1", payment_intent: "pi_meta_1", refunds: [refund])))
        end

        pending.reload
        assert_equal "re_meta_1", pending.stripe_refund_id
        assert pending.status_succeeded?
        assert pending.succeeded_at.present?
        assert_equal 2500, JobLedger.for(job.reload).refunded_cents
      end

      test "pending Stripe refund attaches to the txn without marking it succeeded" do
        job, payment, _collection = create_funded_job(pi_id: "pi_pend_1", charge_id: "ch_pend_1")
        pending = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_pend_1")

        refund = refund_object(id: "re_pend_1", amount: 2500, charge: "ch_pend_1", payment_intent: "pi_pend_1", status: "pending", metadata: { "transaction_id" => pending.id.to_s })
        post_stripe_event(stripe_event(id: "evt_pend_1", type: "charge.refunded", object: charge_object(id: "ch_pend_1", payment_intent: "pi_pend_1", refunds: [refund])))

        pending.reload
        assert_equal "re_pend_1", pending.stripe_refund_id
        assert pending.status_pending?
        assert_nil pending.succeeded_at
        assert_equal 0, JobLedger.for(job.reload).refunded_cents
      end

      test "failed Stripe refund marks the pending txn failed and never counts it" do
        job, payment, _collection = create_funded_job(pi_id: "pi_failed_1", charge_id: "ch_failed_1")
        pending = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_failed_1")

        refund = refund_object(id: "re_failed_1", amount: 2500, charge: "ch_failed_1", payment_intent: "pi_failed_1", status: "failed", metadata: { "transaction_id" => pending.id.to_s }).merge(failure_reason: "expired_or_canceled_card")
        post_stripe_event(stripe_event(id: "evt_failed_1", type: "charge.refunded", object: charge_object(id: "ch_failed_1", payment_intent: "pi_failed_1", refunds: [refund])))

        pending.reload
        assert pending.status_failed?
        assert_equal "re_failed_1", pending.stripe_refund_id
        assert_equal "expired_or_canceled_card", pending.error_message
        assert_equal 0, JobLedger.for(job.reload).refunded_cents
      end

      test "succeeded status on a later delivery upgrades a previously pending linked txn" do
        job, payment, _collection = create_funded_job(pi_id: "pi_upgrade_1", charge_id: "ch_upgrade_1")
        pending = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_upgrade_1")
        meta = { "transaction_id" => pending.id.to_s }

        post_stripe_event(stripe_event(id: "evt_upgrade_1", type: "charge.refunded", object: charge_object(id: "ch_upgrade_1", payment_intent: "pi_upgrade_1", refunds: [refund_object(id: "re_upgrade_1", amount: 2500, charge: "ch_upgrade_1", payment_intent: "pi_upgrade_1", status: "pending", metadata: meta)])))
        assert pending.reload.status_pending?

        post_stripe_event(stripe_event(id: "evt_upgrade_2", type: "charge.refunded", object: charge_object(id: "ch_upgrade_1", payment_intent: "pi_upgrade_1", refunds: [refund_object(id: "re_upgrade_1", amount: 2500, charge: "ch_upgrade_1", payment_intent: "pi_upgrade_1", status: "succeeded", metadata: meta)])))
        assert pending.reload.status_succeeded?
        assert_equal 1, JobPaymentTransaction.where(stripe_refund_id: "re_upgrade_1").count
        assert_equal 2500, JobLedger.for(job.reload).refunded_cents
      end

      test "invalid metadata.transaction_id falls back to external-refund behavior" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_badmeta_1", charge_id: "ch_badmeta_1")
        refunds = [
          refund_object(id: "re_badmeta_nonnumeric", amount: 500, charge: "ch_badmeta_1", payment_intent: "pi_badmeta_1", metadata: { "transaction_id" => "not-a-number" }),
          refund_object(id: "re_badmeta_missing", amount: 700, charge: "ch_badmeta_1", payment_intent: "pi_badmeta_1", metadata: { "transaction_id" => "999999999" })
        ]
        post_stripe_event(stripe_event(id: "evt_badmeta_1", type: "charge.refunded", object: charge_object(id: "ch_badmeta_1", payment_intent: "pi_badmeta_1", refunds: refunds)))

        assert_response :ok
        assert_equal 2, job.job_payment_transactions.company_refunds.count
        assert_equal "stripe_webhook", JobPaymentTransaction.find_by(stripe_refund_id: "re_badmeta_nonnumeric").metadata_json["source"]
        assert_equal 1200, JobLedger.for(job.reload).refunded_cents
      end

      test "metadata.transaction_id pointing to a non-refund txn is not attached" do
        job, _payment, collection = create_funded_job(pi_id: "pi_wrongtype_1", charge_id: "ch_wrongtype_1")
        refund = refund_object(id: "re_wrongtype_1", amount: 500, charge: "ch_wrongtype_1", payment_intent: "pi_wrongtype_1", metadata: { "transaction_id" => collection.id.to_s })
        post_stripe_event(stripe_event(id: "evt_wrongtype_1", type: "charge.refunded", object: charge_object(id: "ch_wrongtype_1", payment_intent: "pi_wrongtype_1", refunds: [refund])))

        collection.reload
        assert_nil collection.stripe_refund_id
        assert collection.status_succeeded?
        assert_equal "initial_job_charge", collection.transaction_type
        external = JobPaymentTransaction.find_by(stripe_refund_id: "re_wrongtype_1")
        assert external.present?
        assert_equal "refund", external.transaction_type
        assert_equal 500, JobLedger.for(job.reload).refunded_cents
      end

      test "metadata match with conflicting amount or charge is not attached" do
        job, payment, _collection = create_funded_job(pi_id: "pi_conflict_1", charge_id: "ch_conflict_1")
        wrong_amount = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_conflict_1")
        wrong_parent = create_pending_app_refund(job: job, payment: payment, amount_cents: 900, pi_id: "pi_some_other_intent")

        refunds = [
          refund_object(id: "re_conflict_amount", amount: 1000, charge: "ch_conflict_1", payment_intent: "pi_conflict_1", metadata: { "transaction_id" => wrong_amount.id.to_s }),
          refund_object(id: "re_conflict_parent", amount: 900, charge: "ch_conflict_1", payment_intent: "pi_conflict_1", metadata: { "transaction_id" => wrong_parent.id.to_s })
        ]
        post_stripe_event(stripe_event(id: "evt_conflict_1", type: "charge.refunded", object: charge_object(id: "ch_conflict_1", payment_intent: "pi_conflict_1", refunds: refunds)))

        assert_nil wrong_amount.reload.stripe_refund_id
        assert wrong_amount.status_pending?
        assert_nil wrong_parent.reload.stripe_refund_id
        assert wrong_parent.status_pending?
        assert JobPaymentTransaction.exists?(stripe_refund_id: "re_conflict_amount")
        assert JobPaymentTransaction.exists?(stripe_refund_id: "re_conflict_parent")
        assert_equal 1900, JobLedger.for(job.reload).refunded_cents
      end

      test "txn already linked to a different refund id is not overwritten" do
        job, payment, _collection = create_funded_job(pi_id: "pi_linked_1", charge_id: "ch_linked_1")
        linked = create_pending_app_refund(job: job, payment: payment, amount_cents: 2500, pi_id: "pi_linked_1")
        linked.update!(stripe_refund_id: "re_linked_original", status: :succeeded, succeeded_at: Time.current)

        refund = refund_object(id: "re_linked_other", amount: 2500, charge: "ch_linked_1", payment_intent: "pi_linked_1", metadata: { "transaction_id" => linked.id.to_s })
        post_stripe_event(stripe_event(id: "evt_linked_1", type: "charge.refunded", object: charge_object(id: "ch_linked_1", payment_intent: "pi_linked_1", refunds: [refund])))

        assert_equal "re_linked_original", linked.reload.stripe_refund_id
        assert JobPaymentTransaction.exists?(stripe_refund_id: "re_linked_other")
      end

      test "external refund without metadata creates a single ledger row (existing behavior)" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_ext_1", charge_id: "ch_ext_1")
        refund = refund_object(id: "re_ext_1", amount: 2000, charge: "ch_ext_1", payment_intent: "pi_ext_1")
        charge = charge_object(id: "ch_ext_1", payment_intent: "pi_ext_1", refunds: [refund])

        post_stripe_event(stripe_event(id: "evt_ext_1", type: "charge.refunded", object: charge))
        post_stripe_event(stripe_event(id: "evt_ext_1", type: "charge.refunded", object: charge))

        assert_response :ok
        rows = JobPaymentTransaction.where(stripe_refund_id: "re_ext_1")
        assert_equal 1, rows.count
        txn = rows.first
        assert_equal 2000, txn.amount_cents
        assert_equal "refund", txn.transaction_type
        assert txn.status_succeeded?
        assert_equal "ch_ext_1", txn.stripe_charge_id
        assert_equal "tf_stripe_refund_re_ext_1", txn.idempotency_key
        assert_equal 2000, JobLedger.for(job.reload).refunded_cents
      end

      test "concurrent external refund inserts: the loser hits the unique idempotency key and reconciles the winner's row" do
        job, payment, _collection = create_funded_job(pi_id: "pi_race_1", charge_id: "ch_race_1")
        refund = refund_object(id: "re_race_1", amount: 2000, charge: "ch_race_1", payment_intent: "pi_race_1")
        charge = charge_object(id: "ch_race_1", payment_intent: "pi_race_1", refunds: [refund])

        # Simulates delivery A committing its insert between delivery B's lookups and B's insert
        # (READ COMMITTED: B's refund-id lookup saw nothing, B's insert then violates the UNIQUE
        # index on idempotency_key). A's row is modelled without stripe_refund_id so B cannot
        # short-circuit on the refund-id match and must go through the insert + RecordNotUnique path.
        winner = JobPaymentTransaction.create!(
          payment: payment, job: job, transaction_type: :refund, direction: :outbound,
          amount_cents: 2000, currency: "usd", status: :pending,
          stripe_charge_id: "ch_race_1", stripe_payment_intent_id: "pi_race_1",
          idempotency_key: "tf_stripe_refund_re_race_1", revision: job.financial_revision
        )

        # In the real race the model's uniqueness validation cannot see A's uncommitted row, so the
        # DB UNIQUE index is what fires; skip the validation here to hit that exact constraint.
        attempted_inserts = 0
        raised = nil
        raw_insert = lambda do |attrs|
          attempted_inserts += 1
          begin
            JobPaymentTransaction.new(attrs).save!(validate: false)
          rescue ActiveRecord::RecordNotUnique => e
            raised = e
            raise
          end
        end
        JobPaymentTransaction.stub(:create!, raw_insert) do
          post_stripe_event(stripe_event(id: "evt_race_1", type: "charge.refunded", object: charge))
        end

        assert_response :ok
        assert_equal 1, attempted_inserts, "insert must be attempted and lose to the unique key"
        assert_kind_of ActiveRecord::RecordNotUnique, raised
        rows = JobPaymentTransaction.where(idempotency_key: "tf_stripe_refund_re_race_1")
        assert_equal 1, rows.count
        assert_equal 1, JobPaymentTransaction.where(job: job).company_refunds.count
        reconciled = rows.first
        assert_equal winner.id, reconciled.id
        assert_equal "re_race_1", reconciled.stripe_refund_id
        assert reconciled.status_succeeded?
        assert_equal 2000, JobLedger.for(job.reload).refunded_cents
        assert StripeWebhookEvent.find_by(stripe_event_id: "evt_race_1").processed_at.present?

        # A later redelivery now matches by refund id and still does not add a row.
        post_stripe_event(stripe_event(id: "evt_race_2", type: "charge.refunded", object: charge))
        assert_equal 1, JobPaymentTransaction.where(job: job).company_refunds.count
        assert_equal 2000, JobLedger.for(job.reload).refunded_cents
      end

      test "concurrent external refund insert where the winner is already visible to the uniqueness validation" do
        job, payment, _collection = create_funded_job(pi_id: "pi_race_2", charge_id: "ch_race_2")
        refund = refund_object(id: "re_race_2", amount: 1500, charge: "ch_race_2", payment_intent: "pi_race_2")
        charge = charge_object(id: "ch_race_2", payment_intent: "pi_race_2", refunds: [refund])
        JobPaymentTransaction.create!(
          payment: payment, job: job, transaction_type: :refund, direction: :outbound,
          amount_cents: 1500, currency: "usd", status: :pending,
          stripe_charge_id: "ch_race_2", stripe_payment_intent_id: "pi_race_2",
          idempotency_key: "tf_stripe_refund_re_race_2", revision: job.financial_revision
        )

        # Unstubbed create!: the model's uniqueness validation raises RecordInvalid for the key.
        post_stripe_event(stripe_event(id: "evt_race_3", type: "charge.refunded", object: charge))

        assert_response :ok
        rows = JobPaymentTransaction.where(job: job).company_refunds
        assert_equal 1, rows.count
        assert_equal "re_race_2", rows.first.stripe_refund_id
        assert rows.first.status_succeeded?
        assert_equal 1500, JobLedger.for(job.reload).refunded_cents
      end

      test "external pending refund is recorded but not counted as refunded" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_extpend_1", charge_id: "ch_extpend_1")
        refund = refund_object(id: "re_extpend_1", amount: 2000, charge: "ch_extpend_1", payment_intent: "pi_extpend_1", status: "pending")
        post_stripe_event(stripe_event(id: "evt_extpend_1", type: "charge.refunded", object: charge_object(id: "ch_extpend_1", payment_intent: "pi_extpend_1", refunds: [refund])))

        txn = JobPaymentTransaction.find_by(stripe_refund_id: "re_extpend_1")
        assert txn.status_pending?
        assert_equal 0, JobLedger.for(job.reload).refunded_cents
      end

      test "charge payload without an expanded refunds list fetches refunds from Stripe" do
        job, _payment, _collection = create_funded_job(pi_id: "pi_norefunds_1", charge_id: "ch_norefunds_1")
        charge = charge_object(id: "ch_norefunds_1", payment_intent: "pi_norefunds_1", refunds: nil)
        refute charge.key?(:refunds)

        listed = Stripe::ListObject.construct_from(
          object: "list", url: "/v1/refunds", has_more: false,
          data: [refund_object(id: "re_listed_1", amount: 1200, charge: "ch_norefunds_1", payment_intent: "pi_norefunds_1")]
        )
        list_args = nil
        Stripe::Refund.stub(:list, ->(params, _opts = nil) { list_args = params; listed }) do
          post_stripe_event(stripe_event(id: "evt_norefunds_1", type: "charge.refunded", object: charge))
        end

        assert_response :ok
        assert_equal "ch_norefunds_1", list_args[:charge]
        assert_equal 1, JobPaymentTransaction.where(stripe_refund_id: "re_listed_1").count
        assert_equal 1200, JobLedger.for(job.reload).refunded_cents
      end

      test "charge.refunded for a charge the ledger does not know is ignored" do
        refund = refund_object(id: "re_unknown_1", amount: 1000, charge: "ch_unknown_1", payment_intent: "pi_unknown_1")
        assert_no_difference -> { JobPaymentTransaction.count } do
          post_stripe_event(stripe_event(id: "evt_unknown_charge", type: "charge.refunded", object: charge_object(id: "ch_unknown_1", payment_intent: "pi_unknown_1", refunds: [refund])))
        end
        assert_response :ok
      end

      test "payment_intent.succeeded is a no-op when the ledger row already succeeded" do
        _job, _payment, collection = create_funded_job(pi_id: "pi_already_succeeded", charge_id: "ch_already_succeeded")
        intent = { id: "pi_already_succeeded", object: "payment_intent", status: "succeeded", latest_charge: "ch_already_succeeded", metadata: {} }
        post_stripe_event(stripe_event(id: "evt_pi_succeeded_1", type: "payment_intent.succeeded", object: intent))

        assert_response :ok
        assert_equal 1, JobPaymentTransaction.where(stripe_payment_intent_id: "pi_already_succeeded").count
        collection.reload
        assert collection.status_succeeded?
        assert_equal 5500, collection.amount_cents
      end

      # ------------------------------------------------------------------
      # Subscription lifecycle ordering
      # ------------------------------------------------------------------

      test "customer.subscription.updated with a paid status grants the tier and persists membership_status" do
        user = create_technician_user(email: "sub-active-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_active")
        with_technician_pro_price("price_tech_pro_active") do
          post_stripe_event(stripe_event(id: "evt_sub_active_1", type: "customer.subscription.updated", object: subscription_object(id: "sub_active_1", customer: "cus_sub_active", status: "active", price_id: "price_tech_pro_active")))
          profile = user.technician_profile.reload
          assert_equal "pro", profile.membership_level
          assert_equal "active", profile.membership_status
          assert_equal "sub_active_1", profile.stripe_membership_subscription_id
        end
      end

      test "customer.subscription.deleted downgrades and clears the subscription" do
        user = create_technician_user(email: "sub-deleted-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_deleted")
        with_technician_pro_price("price_tech_pro_deleted") do
          post_stripe_event(stripe_event(id: "evt_sub_del_1", type: "customer.subscription.updated", object: subscription_object(id: "sub_del_1", customer: "cus_sub_deleted", status: "active", price_id: "price_tech_pro_deleted")))
          assert_equal "pro", user.technician_profile.reload.membership_level

          post_stripe_event(stripe_event(id: "evt_sub_del_2", type: "customer.subscription.deleted", object: subscription_object(id: "sub_del_1", customer: "cus_sub_deleted", status: "canceled", price_id: "price_tech_pro_deleted")))
          profile = user.technician_profile.reload
          assert_equal "basic", profile.membership_level
          assert_equal "canceled", profile.membership_status
          assert_nil profile.stripe_membership_subscription_id
          assert_nil profile.membership_current_period_end_at
        end
      end

      test "stale subscription.updated after subscription.deleted cannot reactivate the tier" do
        user = create_technician_user(email: "sub-stale-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_stale")
        with_technician_pro_price("price_tech_pro_stale") do
          now = Time.now.to_i
          post_stripe_event(stripe_event(id: "evt_stale_del", type: "customer.subscription.deleted", created: now, object: subscription_object(id: "sub_stale_1", customer: "cus_sub_stale", status: "canceled", price_id: "price_tech_pro_stale")))
          # Older event (created before the deletion) delivered late by Stripe.
          post_stripe_event(stripe_event(id: "evt_stale_upd", type: "customer.subscription.updated", created: now - 30, object: subscription_object(id: "sub_stale_1", customer: "cus_sub_stale", status: "active", price_id: "price_tech_pro_stale")))
          assert_response :ok

          profile = user.technician_profile.reload
          assert_equal "basic", profile.membership_level
          assert_nil profile.stripe_membership_subscription_id
          assert StripeWebhookEvent.find_by(stripe_event_id: "evt_stale_upd").processed_at.present?
        end
      end

      test "out-of-order older subscription event does not override a newer one" do
        user = create_technician_user(email: "sub-order-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_order")
        with_technician_pro_price("price_tech_pro_order") do
          now = Time.now.to_i
          post_stripe_event(stripe_event(id: "evt_order_new", type: "customer.subscription.updated", created: now, object: subscription_object(id: "sub_order_1", customer: "cus_sub_order", status: "active", price_id: "price_tech_pro_order")))
          post_stripe_event(stripe_event(id: "evt_order_old", type: "customer.subscription.created", created: now - 5, object: subscription_object(id: "sub_order_1", customer: "cus_sub_order", status: "incomplete", price_id: "price_tech_pro_order")))

          profile = user.technician_profile.reload
          assert_equal "pro", profile.membership_level
          assert_equal "active", profile.membership_status
        end
      end

      test "newer subscription.updated with a non-paid status downgrades" do
        user = create_technician_user(email: "sub-unpaid-#{SecureRandom.hex(3)}@example.com", stripe_customer_id: "cus_sub_unpaid")
        with_technician_pro_price("price_tech_pro_unpaid") do
          now = Time.now.to_i
          post_stripe_event(stripe_event(id: "evt_unpaid_1", type: "customer.subscription.updated", created: now - 5, object: subscription_object(id: "sub_unpaid_1", customer: "cus_sub_unpaid", status: "active", price_id: "price_tech_pro_unpaid")))
          post_stripe_event(stripe_event(id: "evt_unpaid_2", type: "customer.subscription.updated", created: now, object: subscription_object(id: "sub_unpaid_1", customer: "cus_sub_unpaid", status: "unpaid", price_id: "price_tech_pro_unpaid")))

          profile = user.technician_profile.reload
          assert_equal "basic", profile.membership_level
          assert_equal "unpaid", profile.membership_status
          assert_equal "sub_unpaid_1", profile.stripe_membership_subscription_id
        end
      end

      private

      # --- request helpers -------------------------------------------------

      def post_stripe_event(event_hash, secret: PLATFORM_SECRET, payload: nil, timestamp: Time.now)
        payload ||= event_hash.to_json
        signature = Stripe::Webhook::Signature.compute_signature(timestamp, payload, secret)
        header = Stripe::Webhook::Signature.generate_header(timestamp, signature)
        post WEBHOOK_PATH, params: payload, headers: { "Content-Type" => "application/json", "HTTP_STRIPE_SIGNATURE" => header }
      end

      def stripe_event(id:, type:, object:, created: Time.now.to_i, account: nil)
        event = {
          id: id,
          object: "event",
          api_version: "2024-06-20",
          created: created,
          livemode: false,
          pending_webhooks: 1,
          request: { id: nil, idempotency_key: nil },
          type: type,
          data: { object: object }
        }
        event[:account] = account if account
        event
      end

      def unhandled_event(id, account: nil)
        stripe_event(id: id, type: "product.created", object: { id: "prod_#{id}", object: "product" }, account: account)
      end

      def checkout_event(event_id, type, check, session_id:, payment_status:, payment_intent: "pi_#{session_id}")
        stripe_event(
          id: event_id,
          type: type,
          object: {
            id: session_id,
            object: "checkout.session",
            mode: "payment",
            status: "complete",
            payment_status: payment_status,
            payment_intent: payment_intent,
            customer: "cus_#{check.user_id}",
            subscription: nil,
            amount_total: 8000,
            currency: "usd",
            metadata: { background_check_id: check.id.to_s, user_id: check.user_id.to_s }
          }
        )
      end

      def charge_object(id:, payment_intent:, refunds:, amount: 5500, amount_refunded: nil)
        charge = {
          id: id,
          object: "charge",
          amount: amount,
          amount_refunded: amount_refunded || Array(refunds).sum { |r| r[:amount].to_i },
          currency: "usd",
          payment_intent: payment_intent,
          refunded: Array(refunds).sum { |r| r[:amount].to_i } >= amount,
          status: "succeeded"
        }
        unless refunds.nil?
          charge[:refunds] = { object: "list", data: refunds, has_more: false, total_count: refunds.size, url: "/v1/charges/#{id}/refunds" }
        end
        charge
      end

      def refund_object(id:, amount:, charge:, payment_intent:, status: "succeeded", metadata: {}, currency: "usd")
        {
          id: id,
          object: "refund",
          amount: amount,
          charge: charge,
          created: Time.now.to_i,
          currency: currency,
          metadata: metadata,
          payment_intent: payment_intent,
          reason: nil,
          status: status
        }
      end

      def subscription_object(id:, customer:, status:, price_id:, current_period_end: 30.days.from_now.to_i)
        {
          id: id,
          object: "subscription",
          customer: customer,
          status: status,
          current_period_end: current_period_end,
          cancel_at_period_end: false,
          items: {
            object: "list",
            data: [{ id: "si_#{id}", object: "subscription_item", price: { id: price_id, object: "price", currency: "usd" }, quantity: 1 }],
            has_more: false
          },
          metadata: {}
        }
      end

      def account_object(id)
        {
          id: id,
          object: "account",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          capabilities: { transfers: "active" },
          requirements: { currently_due: [] }
        }
      end

      # --- fixtures --------------------------------------------------------

      def create_technician_user(email:, stripe_customer_id: nil)
        user = User.create!(email: email, password: "password123", password_confirmation: "password123", role: :technician)
        user.update_column(:stripe_customer_id, stripe_customer_id) if stripe_customer_id
        TechnicianProfile.create!(user: user, trade_type: "General", availability: "Full-time", membership_level: "basic", phone: "713-555-0150")
        user
      end

      def create_technician(stripe_account_id:)
        user = create_technician_user(email: "tech-#{SecureRandom.hex(4)}@example.com")
        user.technician_profile.update!(stripe_account_id: stripe_account_id)
        user.technician_profile
      end

      def create_pending_background_check(session_id:)
        user = create_technician_user(email: "bg-#{SecureRandom.hex(4)}@example.com")
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          package_name: "essential_plus",
          status: :not_started,
          payment_status: :pending,
          paid_by: "technician",
          payment_amount_cents: 8000,
          stripe_checkout_session_id: session_id
        )
      end

      def stub_checkr_launch
        launches = []
        fake = lambda do |check|
          launches << check.id
          check.update!(status: :invited, provider_invitation_id: "inv_test_1")
          { "id" => "inv_test_1" }
        end
        BackgroundCheckStartService.stub(:launch_checkr_invitation!, fake) { yield }
        launches
      end

      def create_funded_job(pi_id:, charge_id:, amount_cents: 5500)
        company_user = User.create!(email: "wh-co-#{SecureRandom.hex(4)}@example.com", password: "password123", password_confirmation: "password123", role: :company)
        company_profile = CompanyProfile.create!(user: company_user, membership_level: "basic")
        company_user.update_column(:company_profile_id, company_profile.id)
        job = Job.create!(
          company_profile: company_profile,
          title: "Webhook job",
          description: "desc",
          status: :open,
          hourly_rate_cents: 5000,
          hours_per_day: 1,
          days: 1
        )
        JobFundingService.snapshot_company!(job)
        job.save!
        payment = job.payments.create!(amount_cents: amount_cents, status: "held", transfer_group: job.transfer_group, currency: "usd", stripe_payment_intent_id: pi_id)
        collection = JobPaymentTransaction.create!(
          payment: payment,
          job: job,
          transaction_type: :initial_job_charge,
          direction: :inbound,
          amount_cents: amount_cents,
          currency: "usd",
          status: :succeeded,
          stripe_payment_intent_id: pi_id,
          stripe_charge_id: charge_id,
          idempotency_key: "tf_wh_#{job.id}_initial",
          revision: job.financial_revision,
          succeeded_at: Time.current
        )
        [job, payment, collection]
      end

      # Mirrors the row JobFundingService.refund_slice! writes before calling Stripe.
      def create_pending_app_refund(job:, payment:, amount_cents:, pi_id:)
        JobPaymentTransaction.create!(
          payment: payment,
          job: job,
          transaction_type: :refund,
          direction: :outbound,
          amount_cents: amount_cents,
          currency: "usd",
          status: :pending,
          idempotency_key: "tf_job_#{job.id}_txn_refund_r#{job.financial_revision}_#{pi_id}_#{amount_cents}_#{SecureRandom.hex(2)}",
          revision: job.financial_revision,
          metadata_json: { "payment_intent_id" => pi_id }
        )
      end

      def with_technician_pro_price(price_id)
        cfg = MembershipTierConfig.find_by!(audience: "technician", slug: "pro")
        before = cfg.stripe_price_id
        cfg.update!(stripe_price_id: price_id)
        yield
      ensure
        cfg&.update!(stripe_price_id: before)
      end
    end
  end
end
