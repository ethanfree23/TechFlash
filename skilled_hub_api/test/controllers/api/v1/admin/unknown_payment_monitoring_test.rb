# frozen_string_literal: true

require "test_helper"
require "ostruct"

module Api
  module V1
    module Admin
      # Admin monitoring of unknown-outcome collections and the admin reconcile_collection endpoint.
      class UnknownPaymentMonitoringTest < ActionDispatch::IntegrationTest
        include AuthTestHelper

        setup do
          @admin = User.create!(email: "mon-admin-#{SecureRandom.hex(3)}@example.com", password: "password123",
                                password_confirmation: "password123", role: :admin)
          @company_user = User.create!(email: "mon-co-#{SecureRandom.hex(3)}@example.com", password: "password123",
                                       password_confirmation: "password123", role: :company)
          @company_user.update_column(:stripe_customer_id, "cus_mon")
          @company_profile = CompanyProfile.create!(user: @company_user, membership_level: "basic")
          @company_user.update_column(:company_profile_id, @company_profile.id)
          @job = Job.create!(
            company_profile: @company_profile, title: "Mon job", description: "desc", status: :pending_funding,
            funding_status: :adjustment_required, hourly_rate_cents: 5000, hours_per_day: 8, days: 2,
            company_commission_percent_snapshot: 10, agreed_labor_cents: 80_000, financial_revision: 1
          )
          @payment = @job.payments.create!(amount_cents: 88_000, status: "pending", transfer_group: @job.transfer_group, currency: "usd")
          @unknown = JobPaymentTransaction.create!(
            payment: @payment, job: @job, transaction_type: :initial_job_charge, direction: :inbound, amount_cents: 88_000,
            currency: "usd", status: :outcome_unknown, idempotency_key: "tf_mon_unknown_#{@job.id}", revision: 1,
            collection_first_attempted_at: 2.hours.ago, investigation_required: true, metadata_json: {}
          )
          @failed_no_pi = JobPaymentTransaction.create!(
            payment: @payment, job: @job, transaction_type: :counteroffer_top_up, direction: :inbound, amount_cents: 1_000,
            currency: "usd", status: :failed, idempotency_key: "tf_mon_failed_#{@job.id}", revision: 2, error_message: "x", metadata_json: {}
          )
          @stale = JobPaymentTransaction.create!(
            payment: @payment, job: @job, transaction_type: :final_hours_top_up, direction: :inbound, amount_cents: 2_000,
            currency: "usd", status: :outcome_unknown, idempotency_key: "tf_mon_stale_#{@job.id}", revision: 3,
            collection_first_attempted_at: 30.hours.ago, investigation_required: true, metadata_json: {}
          )
        end

        test "monitoring exposes unknown collections, failed-without-PI, ages, and reconciliation split" do
          get "/api/v1/admin/ach_settings/monitoring", headers: auth_header_for(@admin)
          assert_response :ok
          body = JSON.parse(response.body)
          unknown = body.fetch("unknown_payments")
          assert_equal 2, unknown["collections_outcome_unknown"]
          assert_equal 1, unknown["collections_failed_without_payment_intent"]
          assert unknown["oldest_unresolved_age_seconds"] >= 30.hours.to_i - 60
          assert_equal 1, unknown.dig("reconciliation", "pending")
          assert_equal 1, unknown.dig("reconciliation", "requires_admin")
          assert_equal 0, unknown["duplicate_in_flight_attempts"]
          ids = unknown["unresolved"].map { |r| r["transaction_id"] }
          assert_equal [@unknown.id, @stale.id].sort, ids.sort
          row = unknown["unresolved"].find { |r| r["transaction_id"] == @unknown.id }
          assert_equal @job.id, row["job_id"]
          assert_equal @company_profile.id, row["company_profile_id"]
          assert_equal "pending_reconciliation", row["reconciliation"]
          assert_equal @failed_no_pi.id, unknown["failed_without_payment_intent"].first["transaction_id"]
          assert unknown["smoke_tests"].key?("total")
        end

        test "monitoring is admin-only" do
          get "/api/v1/admin/ach_settings/monitoring", headers: auth_header_for(@company_user)
          assert_response :forbidden
        end

        test "reconcile_collection is read-only against Stripe and reports lookup failure without inventing an outcome" do
          lookup_failed = JobStripeOps::PaymentIntentLookupResult.new(status: "lookup_failed", error: "timeout")
          JobStripeOps.stub(:find_payment_intent_for_attempt, lookup_failed) do
            Stripe::PaymentIntent.stub(:create, ->(*_a) { flunk "admin reconcile must never create" }) do
              post "/api/v1/admin/job_payments/#{@unknown.id}/reconcile_collection", headers: auth_header_for(@admin)
            end
          end
          assert_response :unprocessable_entity
          body = JSON.parse(response.body)
          assert_equal "lookup_failed", body["outcome"]
          assert @unknown.reload.status_outcome_unknown?
        end

        test "reconcile_collection applies a recovered succeeded PaymentIntent" do
          pi = OpenStruct.new(id: "pi_mon_1", status: "succeeded", amount: 88_000, currency: "usd", customer: "cus_mon",
                              latest_charge: "ch_mon_1", payment_method: nil, last_payment_error: nil,
                              metadata: { "transaction_id" => @unknown.id.to_s, "job_id" => @job.id.to_s, "payment_id" => @payment.id.to_s })
          found = JobStripeOps::PaymentIntentLookupResult.new(status: "found", payment_intent: pi)
          JobStripeOps.stub(:find_payment_intent_for_attempt, found) do
            JobAlertDispatcher.stub(:dispatch_for_job, true) do
              post "/api/v1/admin/job_payments/#{@unknown.id}/reconcile_collection", headers: auth_header_for(@admin)
            end
          end
          assert_response :ok
          assert_equal "resolved_succeeded", JSON.parse(response.body)["outcome"]
          assert @unknown.reload.status_succeeded?
          assert @job.reload.funding_funded?
        end

        test "reconcile_collection mark_failed requires a reason, an expired window, and a complete not-found" do
          not_found = JobStripeOps::PaymentIntentLookupResult.new(status: "not_found_after_complete_search")
          JobStripeOps.stub(:find_payment_intent_for_attempt, not_found) do
            post "/api/v1/admin/job_payments/#{@stale.id}/reconcile_collection",
                 params: { mark_failed: true }, headers: auth_header_for(@admin)
            assert_response :unprocessable_entity
            assert @stale.reload.status_outcome_unknown?

            post "/api/v1/admin/job_payments/#{@unknown.id}/reconcile_collection",
                 params: { mark_failed: true, reason: "checked dashboard" }, headers: auth_header_for(@admin)
            assert_response :ok
            assert_equal "retry_same_key_allowed", JSON.parse(response.body)["outcome"]
            assert @unknown.reload.status_outcome_unknown?, "inside the window the admin close is not honoured"

            post "/api/v1/admin/job_payments/#{@stale.id}/reconcile_collection",
                 params: { mark_failed: true, reason: "checked dashboard; no PI" }, headers: auth_header_for(@admin)
            assert_response :ok
            assert_equal "resolved_failed", JSON.parse(response.body)["outcome"]
          end
          @stale.reload
          assert @stale.status_failed?
          assert_equal "checked dashboard; no PI", @stale.metadata_json.dig("admin_closed_as_failed", "reason")
        end

        test "reconcile_collection is admin-only" do
          post "/api/v1/admin/job_payments/#{@unknown.id}/reconcile_collection", headers: auth_header_for(@company_user)
          assert_response :forbidden
        end
      end
    end
  end
end
