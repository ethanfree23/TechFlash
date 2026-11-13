require "test_helper"
require "openssl"

module Api
  module V1
    class CheckrWebhooksControllerTest < ActionDispatch::IntegrationTest
      test "webhook returns unauthorized when signing secret missing" do
        old_api_key = ENV["CHECKR_SECRET_KEY"]
        old_legacy = ENV["CHECKR_WEBHOOK_SECRET"]
        ENV["CHECKR_SECRET_KEY"] = nil
        ENV["CHECKR_WEBHOOK_SECRET"] = nil

        post "/api/v1/checkr/webhook",
             params: { id: "evt_missing_secret", type: "report.completed", data: {} }.to_json,
             headers: { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }
        assert_response :unauthorized
      ensure
        ENV["CHECKR_SECRET_KEY"] = old_api_key
        ENV["CHECKR_WEBHOOK_SECRET"] = old_legacy
      end

      test "webhook alias route is available" do
        with_checkr_secret("checkr_secret_alias") do |secret|
          payload = { id: "evt_alias", type: "invitation.created", data: { object: { id: "inv_alias", object: "invitation", status: "pending" } } }.to_json
          signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
          post "/api/v1/webhooks/checkr",
               params: payload,
               headers: {
                 "CONTENT_TYPE" => "application/json",
                 "ACCEPT" => "application/json",
                 "X-Checkr-Signature" => signature
               }
          assert_response :ok
        end
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

        post_signed_event!(
          "checkr_secret_test_2",
          {
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
        )

        assert_response :ok
        check.reload
        assert_equal "clear", check.normalized_status
        assert_equal "complete", check.provider_status
        assert_equal "rep_2", check.provider_report_id
        assert_equal "chk_evt_2", check.last_webhook_event_id
        assert check.eligible_for_background_gate?
      end

      test "report completed with consider result updates status" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-consider@example.com",
          candidate_id: "cand_test_consider"
        )

        post_signed_event!(
          "checkr_secret_consider",
          {
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
        )

        assert_response :ok
        check.reload
        assert_equal "consider", check.normalized_status
        assert_equal "consider", check.result
        assert_equal false, check.eligible_for_background_gate?
        assert_equal false, user.technician_profile.reload.background_verified
      end

      test "report completed with nil result maps to report_complete" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-nil-result@example.com",
          candidate_id: "cand_nil_result"
        )

        post_signed_event!(
          "checkr_secret_nil_result",
          {
            id: "chk_evt_nil_result",
            type: "report.completed",
            data: {
              object: {
                id: "rep_nil_result",
                object: "report",
                candidate_id: "cand_nil_result",
                status: "complete",
                result: nil
              }
            }
          }
        )

        assert_response :ok
        check.reload
        assert_equal "report_complete", check.normalized_status
      end

      test "report completed clear with includes_canceled maps to complete_with_canceled_screenings" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-canceled-screenings@example.com",
          candidate_id: "cand_canceled_screenings"
        )

        post_signed_event!(
          "checkr_secret_canceled_screenings",
          {
            id: "chk_evt_canceled_screenings",
            type: "report.completed",
            data: {
              object: {
                id: "rep_canceled_screenings",
                object: "report",
                candidate_id: "cand_canceled_screenings",
                status: "complete",
                result: "clear",
                includes_canceled: true
              }
            }
          }
        )

        assert_response :ok
        check.reload
        assert_equal "complete_with_canceled_screenings", check.normalized_status
        assert_equal true, check.provider_includes_canceled
        assert_equal false, check.eligible_for_background_gate?
        assert_equal false, user.technician_profile.reload.background_verified
      end

      test "report completed GET success with clear grants verification" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-auth-clear@example.com",
          candidate_id: "cand_auth_clear"
        )

        post_signed_event!(
          "checkr_secret_auth_clear",
          {
            id: "chk_evt_auth_clear",
            type: "report.completed",
            data: {
              object: {
                id: "rep_auth_clear",
                object: "report",
                candidate_id: "cand_auth_clear",
                status: "complete",
                result: "clear"
              }
            }
          }
        )

        assert_response :ok
        check.reload
        assert_equal "clear", check.normalized_status
        assert check.eligible_for_background_gate?
        assert_equal true, user.technician_profile.reload.background_verified
        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_auth_clear")
        assert row.processed_at.present?
      end

      test "report completed GET failure preserves eligibility and stays retryable" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-get-fail@example.com",
          candidate_id: "cand_get_fail"
        )
        user.technician_profile.update!(background_verified: true)

        payload_hash = {
          id: "chk_evt_get_fail",
          type: "report.completed",
          data: {
            object: {
              id: "rep_get_fail",
              object: "report",
              candidate_id: "cand_get_fail",
              status: "complete",
              result: "clear"
            }
          }
        }

        with_stubbed_checkr_report_fetch(report_id: "rep_get_fail", error: CheckrClient::Error.new("timeout")) do
          post_signed_event!("checkr_secret_get_fail", payload_hash, stub_authoritative_report: false)
        end

        assert_response :service_unavailable
        check.reload
        assert_equal "pending", check.normalized_status_value
        assert_equal true, user.technician_profile.reload.background_verified
        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_get_fail")
        assert row.present?
        assert_nil row.processed_at
        assert_equal "checkr_report_get_failed", row.processing_error
      end

      test "report completed wrong candidate ownership stays retryable without clear" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-wrong-owner@example.com",
          candidate_id: "cand_owner_a"
        )

        payload_hash = {
          id: "chk_evt_wrong_owner",
          type: "report.completed",
          data: {
            object: {
              id: "rep_wrong_owner",
              object: "report",
              candidate_id: "cand_owner_a",
              status: "complete",
              result: "clear"
            }
          }
        }

        with_stubbed_checkr_report_fetch(
          report_id: "rep_wrong_owner",
          response: {
            "id" => "rep_wrong_owner",
            "object" => "report",
            "candidate_id" => "cand_owner_OTHER",
            "status" => "complete",
            "result" => "clear"
          }
        ) do
          post_signed_event!("checkr_secret_wrong_owner", payload_hash, stub_authoritative_report: false)
        end

        assert_response :service_unavailable
        check.reload
        assert_equal "pending", check.normalized_status_value
        assert_equal false, check.eligible_for_background_gate?
        assert_equal false, user.technician_profile.reload.background_verified
        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_wrong_owner")
        assert_nil row.processed_at
        assert_equal "ownership_mismatch", row.processing_error
      end

      test "report completed missing provider status does not auto-approve" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-missing-status@example.com",
          candidate_id: "cand_missing_status"
        )

        post_signed_event!(
          "checkr_secret_missing_status",
          {
            id: "chk_evt_missing_status",
            type: "report.completed",
            data: {
              object: {
                id: "rep_missing_status",
                object: "report",
                candidate_id: "cand_missing_status",
                result: "clear"
              }
            }
          },
          authoritative_report: {
            "id" => "rep_missing_status",
            "object" => "report",
            "candidate_id" => "cand_missing_status",
            "result" => "clear"
          }
        )

        assert_response :ok
        check.reload
        refute_equal "clear", check.normalized_status
        assert_equal false, check.eligible_for_background_gate?
        assert_equal false, user.technician_profile.reload.background_verified
      end

      test "report completed recovers after failed GET on redelivery" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-recover-get@example.com",
          candidate_id: "cand_recover_get"
        )
        payload_hash = {
          id: "chk_evt_recover_get",
          type: "report.completed",
          data: {
            object: {
              id: "rep_recover_get",
              object: "report",
              candidate_id: "cand_recover_get",
              status: "complete",
              result: "clear"
            }
          }
        }

        with_stubbed_checkr_report_fetch(report_id: "rep_recover_get", error: CheckrClient::Error.new("timeout")) do
          post_signed_event!("checkr_secret_recover_get", payload_hash, stub_authoritative_report: false)
        end
        assert_response :service_unavailable
        assert_nil CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_recover_get").processed_at
        assert_equal "pending", check.reload.normalized_status_value

        with_stubbed_checkr_report_fetch(
          report_id: "rep_recover_get",
          response: {
            "id" => "rep_recover_get",
            "object" => "report",
            "candidate_id" => "cand_recover_get",
            "status" => "complete",
            "result" => "clear"
          }
        ) do
          post_signed_event!("checkr_secret_recover_get", payload_hash, stub_authoritative_report: false)
        end

        assert_response :ok
        check.reload
        assert_equal "clear", check.normalized_status
        assert check.eligible_for_background_gate?
        assert_equal true, user.technician_profile.reload.background_verified
        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_recover_get")
        assert row.processed_at.present?
        assert row.attempt_count >= 2
      end

      test "repeated webhook after successful processing is idempotent" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-repeat-ok@example.com",
          candidate_id: "cand_repeat_ok"
        )
        payload_hash = {
          id: "chk_evt_repeat_ok",
          type: "report.completed",
          data: {
            object: {
              id: "rep_repeat_ok",
              object: "report",
              candidate_id: "cand_repeat_ok",
              status: "complete",
              result: "clear"
            }
          }
        }

        post_signed_event!("checkr_secret_repeat_ok", payload_hash)
        assert_response :ok
        assert_equal "clear", check.reload.normalized_status

        post_signed_event!("checkr_secret_repeat_ok", payload_hash)
        assert_response :ok
        assert_equal "clear", check.reload.normalized_status
        assert_equal true, user.technician_profile.reload.background_verified
        assert_equal 1, CheckrWebhookEvent.where(checkr_event_id: "chk_evt_repeat_ok").count
        assert CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_repeat_ok").duplicate?
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

      test "invitation completed, expired and deleted lifecycle events map correctly" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-invitation-lifecycle@example.com",
          candidate_id: "cand_invitation_lifecycle",
          invitation_id: "inv_lifecycle_1"
        )

        post_signed_event!(
          "checkr_secret_invitation_lifecycle",
          {
            id: "chk_evt_invite_completed",
            type: "invitation.completed",
            data: { object: { id: "inv_lifecycle_1", object: "invitation", candidate_id: "cand_invitation_lifecycle", status: "completed" } }
          }
        )
        assert_response :ok
        assert_equal "invitation_completed", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_invitation_lifecycle",
          {
            id: "chk_evt_invite_expired",
            type: "invitation.expired",
            data: { object: { id: "inv_lifecycle_1", object: "invitation", candidate_id: "cand_invitation_lifecycle", status: "expired" } }
          }
        )
        assert_response :ok
        assert_equal "invitation_expired", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_invitation_lifecycle",
          {
            id: "chk_evt_invite_deleted",
            type: "invitation.deleted",
            data: { object: { id: "inv_lifecycle_1", object: "invitation", candidate_id: "cand_invitation_lifecycle", status: "deleted" } }
          }
        )
        assert_response :ok
        assert_equal "invitation_deleted", check.reload.normalized_status
      end

      test "report suspended resumed disputed and canceled lifecycle events map correctly" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-report-lifecycle@example.com",
          candidate_id: "cand_report_lifecycle"
        )

        post_signed_event!(
          "checkr_secret_report_lifecycle",
          {
            id: "chk_evt_report_suspended",
            type: "report.suspended",
            data: { object: { id: "rep_report_lifecycle", object: "report", candidate_id: "cand_report_lifecycle", status: "suspended" } }
          }
        )
        assert_response :ok
        assert_equal "report_suspended", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_report_lifecycle",
          {
            id: "chk_evt_report_resumed",
            type: "report.resumed",
            data: { object: { id: "rep_report_lifecycle", object: "report", candidate_id: "cand_report_lifecycle", status: "resumed" } }
          }
        )
        assert_response :ok
        assert_equal "report_resumed", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_report_lifecycle",
          {
            id: "chk_evt_report_disputed",
            type: "report.disputed",
            data: { object: { id: "rep_report_lifecycle", object: "report", candidate_id: "cand_report_lifecycle", status: "disputed" } }
          }
        )
        assert_response :ok
        assert_equal "report_disputed", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_report_lifecycle",
          {
            id: "chk_evt_report_canceled",
            type: "report.canceled",
            data: { object: { id: "rep_report_lifecycle", object: "report", candidate_id: "cand_report_lifecycle", status: "canceled" } }
          }
        )
        assert_response :ok
        assert_equal "report_canceled", check.reload.normalized_status
      end

      test "adverse action and engaged lifecycle events are accepted and mapped" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-adverse-lifecycle@example.com",
          candidate_id: "cand_adverse_lifecycle"
        )

        post_signed_event!(
          "checkr_secret_adverse_lifecycle",
          {
            id: "chk_evt_report_pre_adverse",
            type: "report.pre_adverse_action",
            data: { object: { id: "rep_adverse", object: "report", candidate_id: "cand_adverse_lifecycle", status: "complete", result: "consider" } }
          }
        )
        assert_response :ok
        assert_equal "report_pre_adverse_action", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_adverse_lifecycle",
          {
            id: "chk_evt_report_engaged",
            type: "report.engaged",
            data: { object: { id: "rep_adverse", object: "report", candidate_id: "cand_adverse_lifecycle", status: "complete", result: "consider" } }
          }
        )
        assert_response :ok
        assert_equal "report_engaged", check.reload.normalized_status

        post_signed_event!(
          "checkr_secret_adverse_lifecycle",
          {
            id: "chk_evt_adverse_notice_missing",
            type: "adverse_action.notice_not_delivered",
            data: { object: { id: "adverse_1", object: "adverse_action", report_id: "rep_adverse", candidate_id: "cand_adverse_lifecycle", status: "pending" } }
          }
        )
        assert_response :ok
        assert_equal "adverse_action_notice_not_delivered", check.reload.normalized_status
      end

      test "report updated with assess review sets review_required and stores assessment" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-assess-review@example.com",
          candidate_id: "cand_assess_review"
        )

        post_signed_event!(
          "checkr_secret_assess_review",
          {
            id: "chk_evt_assess_review",
            type: "report.updated",
            data: {
              object: {
                id: "rep_assess_review",
                object: "report",
                candidate_id: "cand_assess_review",
                status: "complete",
                result: "clear",
                assessment: "review"
              }
            }
          }
        )

        assert_response :ok
        check.reload
        assert_equal "review_required", check.normalized_status
        assert_equal "review", check.provider_assess_status
      end

      test "unknown event types are safely accepted and recorded" do
        user, check = create_checkr_background_check(
          email: "checkr-webhook-unknown@example.com",
          candidate_id: "cand_unknown"
        )

        post_signed_event!(
          "checkr_secret_test_3",
          {
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
        )

        assert_response :ok
        event = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_unknown")
        assert event.present?
        assert_equal "invitation.custom_update", event.event_type
        assert event.processed_at.present?
        assert_equal "pending", check.reload.normalized_status_value
        assert_equal false, user.technician_profile.reload.background_verified
      end

      test "valid unmatched event is recorded and returns ok" do
        post_signed_event!(
          "checkr_secret_unmatched",
          {
            id: "chk_evt_unmatched",
            type: "report.completed",
            data: { object: { id: "rep_unmatched", object: "report", candidate_id: "cand_unmatched", status: "complete", result: "clear" } }
          },
          stub_authoritative_report: false
        )

        assert_response :ok
        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_unmatched")
        assert row.present?
        assert_equal "unmatched_background_check", row.processing_error
      end

      test "out of order report events do not regress completed status" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-order@example.com",
          candidate_id: "cand_order"
        )

        post_signed_event!(
          "checkr_secret_order",
          {
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
          }
        )
        assert_response :ok

        post_signed_event!(
          "checkr_secret_order",
          {
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
          }
        )
        assert_response :ok

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

      test "malicious uri does not bypass id validation for hydration" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-ssrf@example.com",
          candidate_id: "cand_ssrf"
        )

        post_signed_event!(
          "checkr_secret_ssrf",
          {
            id: "chk_evt_ssrf",
            type: "report.completed",
            data: {
              object: {
                id: "rep_ssrf",
                object: "report",
                candidate_id: "cand_ssrf",
                uri: "https://evil.example.com/v1/reports/../../../etc/passwd",
                status: "complete",
                result: "clear"
              }
            }
          }
        )

        assert_response :ok
        assert_equal "clear", check.reload.normalized_status
      end

      test "failed processing remains retryable and second delivery can succeed" do
        _user, check = create_checkr_background_check(
          email: "checkr-webhook-retryable@example.com",
          candidate_id: "cand_retryable"
        )
        payload_hash = {
          id: "chk_evt_retryable",
          type: "report.completed",
          data: {
            object: {
              id: "rep_retryable",
              object: "report",
              candidate_id: "cand_retryable",
              status: "complete",
              result: "clear"
            }
          }
        }
        payload = payload_hash.to_json

        klass = Api::V1::CheckrWebhooksController
        called = false
        klass.class_eval do
          alias_method :__original_process_event_retryable, :process_event
        end
        klass.define_method(:process_event) do |event, rec:|
          unless called
            called = true
            raise "forced failure"
          end
          __original_process_event_retryable(event, rec: rec)
        end

        with_stubbed_checkr_report_fetch(
          report_id: "rep_retryable",
          response: {
            "id" => "rep_retryable",
            "object" => "report",
            "candidate_id" => "cand_retryable",
            "status" => "complete",
            "result" => "clear"
          }
        ) do
          with_checkr_secret("checkr_secret_retryable") do |secret|
            signature = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
            post "/api/v1/checkr/webhook",
                 params: payload,
                 headers: {
                   "CONTENT_TYPE" => "application/json",
                   "ACCEPT" => "application/json",
                   "X-Checkr-Signature" => signature
                 }
            assert_response :internal_server_error

            row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_retryable")
            assert row.present?
            assert_nil row.processed_at
            assert row.processing_error.present?
            assert_equal 1, row.attempt_count

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

        row = CheckrWebhookEvent.find_by(checkr_event_id: "chk_evt_retryable")
        assert row.processed_at.present?
        assert row.attempt_count >= 2
        assert_equal "clear", check.reload.normalized_status
      ensure
        klass.class_eval do
          alias_method :process_event, :__original_process_event_retryable
          remove_method :__original_process_event_retryable
        end
      end

      private

      def post_signed_event!(secret, payload_hash, stub_authoritative_report: true, authoritative_report: nil)
        deliver = lambda do
          payload = payload_hash.to_json
          with_checkr_secret(secret) do |s|
            signature = OpenSSL::HMAC.hexdigest("SHA256", s, payload)
            post "/api/v1/checkr/webhook",
                 params: payload,
                 headers: {
                   "CONTENT_TYPE" => "application/json",
                   "ACCEPT" => "application/json",
                   "X-Checkr-Signature" => signature
                 }
          end
        end

        if stub_authoritative_report && payload_hash[:type].to_s == "report.completed"
          object = payload_hash.dig(:data, :object) || {}
          report = (authoritative_report || object).each_with_object({}) do |(key, value), memo|
            memo[key.to_s] = value
          end
          report["id"] ||= object[:id] || object["id"]
          with_stubbed_checkr_report_fetch(report_id: report["id"], response: report) { deliver.call }
        else
          deliver.call
        end
      end

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
          define_method :process_event do |_event, rec:|
            process_counter&.call
            { outcome: "processed", hydrated: false, background_check_id: nil, processing_error: nil }
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

      def with_stubbed_checkr_report_fetch(report_id:, response: nil, error: nil)
        expected_report_id = report_id
        stub_response = response
        stub_error = error
        klass = CheckrClient
        klass.class_eval do
          alias_method :__original_configured_for_webhook_test, :configured?
          alias_method :__original_get_report_for_webhook_test, :get_report
        end
        klass.define_method(:configured?) { true }
        klass.define_method(:get_report) do |report_id:|
          raise stub_error if stub_error
          return stub_response if report_id == expected_report_id

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
