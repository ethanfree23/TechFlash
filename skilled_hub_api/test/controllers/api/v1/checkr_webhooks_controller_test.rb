require "test_helper"
require "openssl"

module Api
  module V1
    class CheckrWebhooksControllerTest < ActionDispatch::IntegrationTest
      test "webhook returns ok when signing secret missing" do
        old_api_key = ENV["CHECKR_SECRET_KEY"]
        old_legacy = ENV["CHECKR_WEBHOOK_SECRET"]
        ENV["CHECKR_SECRET_KEY"] = nil
        ENV["CHECKR_WEBHOOK_SECRET"] = nil

        post "/api/v1/checkr/webhook",
             params: { id: "evt_missing_secret", type: "report.completed", data: {} }.to_json,
             headers: { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }
        assert_response :ok
      ensure
        ENV["CHECKR_SECRET_KEY"] = old_api_key
        ENV["CHECKR_WEBHOOK_SECRET"] = old_legacy
      end

      test "webhook alias route is available" do
        old_api_key = ENV["CHECKR_SECRET_KEY"]
        ENV["CHECKR_SECRET_KEY"] = nil
        post "/api/v1/webhooks/checkr",
             params: { id: "evt_alias", type: "report.completed", data: {} }.to_json,
             headers: { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }
        assert_response :ok
      ensure
        ENV["CHECKR_SECRET_KEY"] = old_api_key
      end

      test "webhook returns ok when checkr integration is disabled" do
        old_enabled = ENV["CHECKR_ENABLED"]
        old_background_checks_enabled = ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"]
        ENV["CHECKR_ENABLED"] = "false"
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = "false"

        post "/api/v1/checkr/webhook",
             params: { id: "evt_disabled", type: "report.completed", data: {} }.to_json,
             headers: { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }

        assert_response :ok
      ensure
        ENV["CHECKR_ENABLED"] = old_enabled
        ENV["CHECKR_BACKGROUND_CHECKS_ENABLED"] = old_background_checks_enabled
      end

      test "invalid signature returns unauthorized" do
        payload = {
          id: "chk_evt_invalid_sig",
          type: "report.completed",
          data: {
            object: {
              id: "rep_invalid_sig",
              object: "report",
              candidate_id: "cand_invalid_sig",
              status: "complete",
              result: "clear"
            }
          }
        }.to_json

        with_checkr_secret("checkr_secret_invalid_sig") do
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => "notavalidsignature"
               }
          assert_response :unauthorized
        end
      end

      test "malformed json returns bad request" do
        malformed_payload = "{\"id\": \"bad\", "
        signature = OpenSSL::HMAC.hexdigest("SHA256", "checkr_secret_malformed", malformed_payload)

        with_checkr_secret("checkr_secret_malformed") do
          post "/api/v1/checkr/webhook",
               params: malformed_payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :bad_request
        end
      end

      test "signature verification uses exact raw request body" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-raw-body@example.com",
          candidate_id: "cand_raw_body"
        )
        assert user.present?

        signed_payload = <<~JSON.chomp
          {"id":"chk_evt_raw","type":"report.completed","data":{"object":{"id":"rep_raw","object":"report","candidate_id":"cand_raw_body","status":"complete","result":"clear"}}}
        JSON

        altered_payload = <<~JSON.chomp
          { "id":"chk_evt_raw","type":"report.completed","data":{"object":{"id":"rep_raw","object":"report","candidate_id":"cand_raw_body","status":"complete","result":"clear"}}}
        JSON

        with_checkr_secret("checkr_secret_raw") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, signed_payload)

          post "/api/v1/checkr/webhook",
               params: altered_payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :unauthorized
        end

        check.reload
        assert_equal "pending", check.normalized_status_value
      end

      test "duplicate checkr webhook event is idempotent" do
        _user, _check = create_checkr_background_check(
          email: "checkr-webhook-tech@example.com",
          candidate_id: "cand_test_1"
        )

        payload_hash = {
          id: "chk_evt_1",
          type: "report.completed",
          data: {
            object: {
              id: "rep_1",
              object: "report",
              candidate_id: "cand_test_1",
              status: "complete",
              result: "clear"
            }
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
                     "X-Checkr-Signature" => signature
                   }
              assert_response :ok
            end
          end
        end

        assert_equal 1, CheckrWebhookEvent.where(checkr_event_id: "chk_evt_1").count
        assert_equal 1, process_calls
      end

      test "report completed updates normalized and provider statuses" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-clear@example.com",
          candidate_id: "cand_test_2"
        )

        payload_hash = {
          id: "chk_evt_2",
          type: "report.completed",
          data: {
            object: {
              id: "rep_2",
              object: "report",
              candidate_id: "cand_test_2",
              status: "complete",
              result: "clear",
              estimated_completion_time: 2.hours.from_now.iso8601
            }
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
                 "X-Checkr-Signature" => signature
               }
          assert_response :ok
        end

        check.reload
        assert_equal "clear", check.normalized_status
        assert_equal "complete", check.provider_status
        assert_equal "rep_2", check.provider_report_id
        assert_equal "chk_evt_2", check.last_webhook_event_id
      end

      test "report completed with consider result updates status" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-consider@example.com",
          candidate_id: "cand_test_consider"
        )

        payload_hash = {
          id: "chk_evt_consider",
          type: "report.completed",
          data: {
            object: {
              id: "rep_consider",
              object: "report",
              candidate_id: "cand_test_consider",
              status: "complete",
              result: "consider"
            }
          }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        with_checkr_secret("checkr_secret_consider") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :ok
        end

        check.reload
        assert_equal "consider", check.normalized_status
        assert_equal "consider", check.result
      end

      test "invitation event updates invitation status from data object payload" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-invitation@example.com",
          candidate_id: "cand_invite",
          invitation_id: "inv_123"
        )

        payload_hash = {
          id: "chk_evt_invite_created",
          type: "invitation.created",
          data: {
            object: {
              id: "inv_123",
              object: "invitation",
              candidate_id: "cand_invite",
              status: "pending",
              invitation_url: "https://apply.checkr.com/invite/demo"
            }
          }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        with_checkr_secret("checkr_secret_invitation") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :ok
        end

        check.reload
        assert_equal "invitation_sent", check.normalized_status
        assert_equal "pending", check.provider_status
        assert_equal "https://apply.checkr.com/invite/demo", check.invitation_url
      end

      test "unknown event types are safely accepted and recorded" do
        _user, _check = create_checkr_background_check(
          email: "checkr-webhook-unknown@example.com",
          candidate_id: "cand_unknown"
        )

        payload_hash = {
          id: "chk_evt_unknown",
          type: "invitation.custom_update",
          data: {
            object: {
              id: "inv_custom_1",
              object: "invitation",
              candidate_id: "cand_unknown",
              status: "processing"
            }
          }
        }
        payload = ActiveSupport::JSON.encode(payload_hash)

        with_checkr_secret("checkr_secret_test_3") do |secret|
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/checkr/webhook",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :ok
        end

        event = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_unknown")
        assert event.present?
        assert_equal "invitation.custom_update", event.event_type
      end

      test "out of order report events do not regress completed status" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-order@example.com",
          candidate_id: "cand_order"
        )

        completed_payload = {
          id: "chk_evt_order_complete",
          type: "report.completed",
          data: {
            object: {
              id: "rep_order",
              object: "report",
              candidate_id: "cand_order",
              status: "complete",
              result: "clear"
            }
          }
        }.to_json

        older_pending_payload = {
          id: "chk_evt_order_pending",
          type: "report.updated",
          data: {
            object: {
              id: "rep_order",
              object: "report",
              candidate_id: "cand_order",
              status: "pending",
              result: nil
            }
          }
        }.to_json

        with_checkr_secret("checkr_secret_order") do |secret|
          complete_sig = OpenSSL::HMAC.hexdigest("SHA256", secret, completed_payload)
          post "/api/v1/checkr/webhook",
               params: completed_payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => complete_sig
               }
          assert_response :ok

          pending_sig = OpenSSL::HMAC.hexdigest("SHA256", secret, older_pending_payload)
          post "/api/v1/checkr/webhook",
               params: older_pending_payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => pending_sig
               }
          assert_response :ok
        end

        check.reload
        assert_equal "clear", check.normalized_status
        assert check.clear?
      end

      test "reduced data object payload hydrates report from checkr api" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-hydrate@example.com",
          candidate_id: "cand_hydrated"
        )

        payload = {
          id: "chk_evt_hydrate",
          type: "report.completed",
          data: {
            object: {
              id: "rep_hydrate",
              object: "report",
              uri: "/v1/reports/rep_hydrate"
            }
          }
        }.to_json

        with_stubbed_checkr_report_fetch(
          report_id: "rep_hydrate",
          response: {
            "id" => "rep_hydrate",
            "object" => "report",
            "candidate_id" => "cand_hydrated",
            "status" => "complete",
            "result" => "clear",
            "uri" => "/v1/reports/rep_hydrate"
          }
        ) do
          with_checkr_secret("checkr_secret_hydrate") do |secret|
            signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
            post "/api/v1/checkr/webhook",
                 params: payload,
                 headers: {
                   "CONTENT_TYPE" => "application/json",
                   "ACCEPT" => "application/json",
                   "X-Checkr-Signature" => signature
                 }
            assert_response :ok
          end
        end

        check.reload
        assert_equal "clear", check.normalized_status
        assert_equal "rep_hydrate", check.provider_report_id
      end

      private

      def with_checkr_secret(secret)
        old_secret = ENV["CHECKR_SECRET_KEY"]
        ENV["CHECKR_SECRET_KEY"] = secret
        yield(secret)
      ensure
        ENV["CHECKR_SECRET_KEY"] = old_secret
      end

      def create_checkr_background_check(email:, candidate_id:, invitation_id: nil)
        user = User.create!(
          email: email,
          password: "password123",
          password_confirmation: "password123",
          role: :technician
        )
        TechnicianProfile.create!(
          user: user,
          trade_type: "Electrician",
          availability: "Full-time",
          membership_level: "basic",
          phone: "5551234567",
          background_verified: false
        )
        check = BackgroundCheck.create!(
          user: user,
          provider: "checkr",
          provider_candidate_id: candidate_id,
          provider_invitation_id: invitation_id,
          package_name: "essential_plus",
          status: :pending,
          normalized_status: "pending",
          payment_status: :paid,
          paid_by: "technician"
        )
        [user, check]
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

      def with_stubbed_checkr_report_fetch(report_id:, response:)
        expected_report_id = report_id
        klass = CheckrClient
        klass.class_eval do
          alias_method :__original_configured_for_webhook_test, :configured?
          alias_method :__original_get_report_for_webhook_test, :get_report
        end
        klass.define_method(:configured?) { true }
        klass.define_method(:get_report) do |report_id:|
          return response if report_id == expected_report_id

          raise CheckrClient::Error, "unexpected report_id"
        end
        yield
      ensure
        klass.class_eval do
          alias_method :configured?, :__original_configured_for_webhook_test
          remove_method :__original_configured_for_webhook_test
          alias_method :get_report, :__original_get_report_for_webhook_test
          remove_method :__original_get_report_for_webhook_test
        end
      end
    end
  end
end
