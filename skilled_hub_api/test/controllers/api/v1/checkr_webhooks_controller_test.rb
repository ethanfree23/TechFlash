require "test_helper"
require "openssl"

module Api
  module V1
    class CheckrWebhooksControllerTest < ActionDispatch::IntegrationTest
      test "webhook returns service unavailable when secret missing" do
        old_secret = ENV["CHECKR_WEBHOOK_SECRET"]
        ENV["CHECKR_WEBHOOK_SECRET"] = nil
        post "/api/v1/checkr/webhook",
             params: { id: "evt_missing_secret", type: "report.completed", data: {} }.to_json,
             headers: { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }
        assert_response :service_unavailable
      ensure
        ENV["CHECKR_WEBHOOK_SECRET"] = old_secret
      end

      test "duplicate checkr webhook event is idempotent" do
        user = User.create!(
          email: "checkr-webhook-tech@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          availability: "Full-time",
          membership_level: "basic",
          background_verified: false
        )
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          provider_candidate_id: "cand_test_1",
          package_name: "essential_plus",
          status: :pending,
          payment_status: :paid,
          paid_by: "technician"
        )

        payload_hash = {
          id: "chk_evt_1",
          type: "report.completed",
          data: {
            id: "rep_1",
            candidate_id: "cand_test_1",
            status: "complete",
            result: "clear"
          }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        process_calls = 0
        with_checkr_secret("checkr_secret_test") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          with_stubbed_webhook_validation_and_processing(process_counter: -> { process_calls += 1 }) do
            2.times do
              post "/api/v1/checkr/webhook",
                   params: payload,
                   headers: {
                     "CONTENT_TYPE" => "application/json",
                     "ACCEPT" => "application/json",
                     "HTTP_CHECKR_SIGNATURE" => signature
                   }
              assert_response :ok
            end
          end
        end

        assert_equal 1, CheckrWebhookEvent.where(checkr_event_id: "chk_evt_1").count
        assert_equal 1, process_calls
      end

      test "report completed updates normalized and provider statuses" do
        user = User.create!(
          email: "checkr-webhook-clear@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          availability: "Full-time",
          membership_level: "basic",
          background_verified: false
        )
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          provider_candidate_id: "cand_test_2",
          package_name: "essential_plus",
          status: :pending,
          payment_status: :paid,
          paid_by: "technician"
        )

        payload_hash = {
          id: "chk_evt_2",
          type: "report.completed",
          data: {
            id: "rep_2",
            candidate_id: "cand_test_2",
            status: "complete",
            result: "clear",
            estimated_completion_time: 2.hours.from_now.iso8601
          }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        with_checkr_secret("checkr_secret_test_2") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "HTTP_CHECKR_SIGNATURE" => signature
               }
          assert_response :ok
        end

        check.reload
        assert_equal "clear", check.normalized_status
        assert_equal "complete", check.provider_status
        assert_equal "rep_2", check.provider_report_id
        assert_equal "chk_evt_2", check.last_webhook_event_id
      end

      test "unknown event types are safely accepted and recorded" do
        user = User.create!(
          email: "checkr-webhook-unknown@example.com",
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          provider_candidate_id: "cand_unknown",
          package_name: "essential_plus",
          status: :pending,
          payment_status: :paid,
          paid_by: "technician"
        )

        payload_hash = {
          id: "chk_evt_unknown",
          type: "invitation.custom_update",
          data: { id: "inv_custom_1", candidate_id: "cand_unknown", status: "processing" }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        with_checkr_secret("checkr_secret_test_3") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "HTTP_CHECKR_SIGNATURE" => signature
               }
          assert_response :ok
        end

        event = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_unknown")
        assert event.present?
        assert_equal "invitation.custom_update", event.event_type
      end

      private

      def with_checkr_secret(secret)
        old_secret = ENV["CHECKR_WEBHOOK_SECRET"]
        ENV["CHECKR_WEBHOOK_SECRET"] = secret
        yield(secret)
      ensure
        ENV["CHECKR_WEBHOOK_SECRET"] = old_secret
      end

      def with_stubbed_webhook_validation_and_processing(process_counter:)
        klass = Api::V1::CheckrWebhooksController
        klass.class_eval do
          alias_method :__original_valid_signature_for_test, :valid_signature?
          alias_method :__original_process_event_for_test, :process_event
          define_method :valid_signature? do |_payload, _signature, _secret|
            true
          end
          define_method :process_event do |_event|
            process_counter&.call
            true
          end
        end
        yield
      ensure
        klass.class_eval do
          alias_method :valid_signature?, :__original_valid_signature_for_test
          remove_method :__original_valid_signature_for_test
          alias_method :process_event, :__original_process_event_for_test
          remove_method :__original_process_event_for_test
        end
      end
    end
  end
end
