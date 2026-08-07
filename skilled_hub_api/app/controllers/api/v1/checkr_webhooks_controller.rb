module Api
  module V1
    class CheckrWebhooksController < ActionController::API
      CHECKR_ID_REGEX = /\A[a-zA-Z0-9_-]+\z/.freeze

      def create
        checkr_configuration = CheckrConfiguration.new
        return head :ok unless checkr_configuration.requests_allowed?

        rec = nil
        event_id = nil
        event_type = nil
        object_type = nil
        object_id = nil
        started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        payload = request.body.read
        signature = request.headers["X-Checkr-Signature"].to_s.presence || request.env["HTTP_X_CHECKR_SIGNATURE"].to_s
        secret = signing_secret(checkr_configuration)

        if secret.blank?
          Rails.logger.warn("[checkr_webhook] missing signing secret")
          CheckrWebhookMetrics.increment("webhook_processing_failed", tags: { reason: "missing_signing_secret" })
          return head :ok
        end

        unless valid_signature?(payload, signature, secret)
          CheckrWebhookMetrics.increment("webhook_invalid_signature")
          return head :unauthorized
        end

        event = JSON.parse(payload)
        event_id = event["id"].to_s
        return head :bad_request if event_id.blank?
        event_type = event["type"].to_s
        object = extract_object(event)
        object_type, object_id = resolve_object_identity(event_type, object)

        rec, duplicate = persist_event_record!(
          event: event,
          event_id: event_id,
          event_type: event_type,
          object_type: object_type,
          object_id: object_id
        )

        if duplicate
          CheckrWebhookMetrics.increment("webhook_duplicate", tags: { event_type: event_type, object_type: object_type })
          return head :ok
        end

        CheckrWebhookMetrics.increment("webhook_received", tags: { event_type: event_type, object_type: object_type })
        outcome = process_event(event, rec: rec)

        rec.update!(
          processed_at: Time.current,
          hydrated: outcome[:hydrated] == true,
          background_check_id: outcome[:background_check_id],
          processing_error: outcome[:processing_error]
        )

        log_event(
          event_id: event_id,
          event_type: event_type,
          object_type: object_type,
          object_id: object_id,
          background_check_id: outcome[:background_check_id],
          provider_status: outcome[:provider_status],
          provider_result: outcome[:provider_result],
          assessment: outcome[:assessment],
          includes_canceled: outcome[:includes_canceled],
          hydrated: outcome[:hydrated],
          duplicate: false,
          outcome: outcome[:outcome],
          duration_ms: elapsed_ms(started_at)
        )

        metric_for_outcome(outcome)
        CheckrWebhookMetrics.increment("webhook_processed", tags: { event_type: event_type, outcome: outcome[:outcome] })
        head :ok
      rescue JSON::ParserError
        CheckrWebhookMetrics.increment("webhook_malformed")
        head :bad_request
      rescue StandardError => e
        if rec.present?
          rec.update_columns(processing_error: "#{e.class}: #{e.message}", updated_at: Time.current)
        elsif event_id.present?
          existing = CheckrWebhookEvent.find_by(checkr_event_id: event_id)
          existing&.update_columns(processing_error: "#{e.class}: #{e.message}", updated_at: Time.current)
        end
        CheckrWebhookMetrics.increment("webhook_processing_failed", tags: { error: e.class.name })
        Rails.logger.error("[checkr_webhook] processing failure: #{e.class} #{e.message}")
        head :internal_server_error
      end

      private

      def signing_secret(checkr_configuration)
        api_key = checkr_configuration.api_key.to_s.presence
        return api_key if api_key.present?

        legacy_secret = checkr_configuration.webhook_secret.to_s.presence
        Rails.logger.warn("[checkr_webhook] legacy webhook secret fallback in use") if legacy_secret.present?
        legacy_secret
      end

      def valid_signature?(payload, signature, secret)
        return false if payload.blank? || signature.blank? || secret.blank?

        expected = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
        provided = signature.to_s.strip
        return false unless expected.bytesize == provided.bytesize

        ActiveSupport::SecurityUtils.secure_compare(expected, provided)
      rescue StandardError
        false
      end

      def persist_event_record!(event:, event_id:, event_type:, object_type:, object_id:)
        duplicate = false
        rec = nil
        CheckrWebhookEvent.transaction do
          rec = CheckrWebhookEvent.lock.find_or_initialize_by(checkr_event_id: event_id)
          rec.received_at ||= Time.current
          rec.processing_started_at = Time.current
          rec.attempt_count = rec.attempt_count.to_i + 1
          rec.event_type = event_type
          rec.object_type = object_type
          rec.object_id = object_id
          rec.payload = sanitized_event_payload(event).to_json
          rec.processing_error = nil
          if rec.processed_at.present?
            rec.duplicate = true
            duplicate = true
          else
            rec.duplicate = false
          end
          rec.save!
        end
        [rec, duplicate]
      end

      def process_event(event, rec:)
        event_type = event["type"].to_s
        object = extract_object(event)
        object, hydrated = hydrate_object(event, object)
        invitation_id = resolve_invitation_id(event_type, object)
        report_id = resolve_report_id(event_type, object, object["report_id"])
        candidate_id = object["candidate_id"]

        if invitation_id.blank? && report_id.blank? && candidate_id.blank?
          return {
            outcome: "recorded_no_identifiers",
            hydrated: hydrated,
            processing_error: "recorded_no_identifiers"
          }
        end

        check = BackgroundCheck.where(provider: "checkr")
          .where("provider_invitation_id = ? OR provider_report_id = ? OR provider_candidate_id = ?", invitation_id, report_id, candidate_id)
          .order(created_at: :desc)
          .first

        if check.blank?
          Rails.logger.warn("[checkr_webhook] unmatched event_id=#{event['id']} type=#{event_type} object_type=#{object['object']} object_id=#{object['id']}")
          return {
            outcome: "unmatched_background_check",
            hydrated: hydrated,
            processing_error: "unmatched_background_check",
            provider_status: object["status"],
            provider_result: object["result"],
            assessment: extract_assess_status(object),
            includes_canceled: ActiveModel::Type::Boolean.new.cast(object["includes_canceled"]) || false
          }
        end

        if report_id.present? && (report_event?(event_type) || object["object"].to_s == "report")
          object, report_hydrated = hydrate_report_object(report_id, object)
          hydrated ||= report_hydrated
        end

        mapping = CheckrLifecycleMapper.resolve(event_type: event_type, object: object)
        mapped_status = mapping[:normalized_status]
        includes_canceled = ActiveModel::Type::Boolean.new.cast(object["includes_canceled"]) || false
        provider_assessment = extract_assess_status(object)
        provider_adjudication = object["adjudication"]
        provider_updated_at = parse_provider_updated_at(object)

        if stale_event_for_check?(check, provider_updated_at, mapping)
          object, refreshed = hydrate_authoritative_object(
            check,
            event_type: event_type,
            object: object,
            report_id: report_id,
            invitation_id: invitation_id
          )
          if refreshed
            hydrated = true
            mapping = CheckrLifecycleMapper.resolve(event_type: event_type, object: object)
            mapped_status = mapping[:normalized_status]
            includes_canceled = ActiveModel::Type::Boolean.new.cast(object["includes_canceled"]) || false
            provider_assessment = extract_assess_status(object)
            provider_adjudication = object["adjudication"]
            provider_updated_at = parse_provider_updated_at(object)
          else
            mapped_status = check.normalized_status_value
          end
        end

        mapped_status = resolve_non_regressive_status(
          check,
          mapped_status,
          provider_updated_at: provider_updated_at,
          current_provider_updated_at: check.provider_updated_at
        )

        attrs = {
          status: normalized_to_legacy_status(mapped_status),
          normalized_status: mapped_status,
          last_webhook_event_id: event["id"],
          provider_object_type: object["object"].to_s.presence || check.provider_object_type
        }
        attrs[:result] = object["result"]
        attrs[:provider_report_id] = report_id if report_id.present?
        attrs[:provider_status] = object["status"] if object["status"].present?
        attrs[:provider_assess_status] = provider_assessment
        attrs[:provider_adjudication] = provider_adjudication if provider_adjudication.present?
        attrs[:provider_includes_canceled] = includes_canceled
        attrs[:provider_updated_at] = provider_updated_at if provider_updated_at.present?
        attrs[:invitation_url] = object["invitation_url"] if object["invitation_url"].present?
        attrs[:report_url] = object["report_url"] || object["uri"] if (object["report_url"].present? || object["uri"].present?)
        attrs[:dashboard_url] = object["dashboard_url"] if object["dashboard_url"].present?
        attrs[:report_eta_at] = parse_eta(object["eta"] || object["estimated_completion_time"])
        attrs[:completed_at] = Time.current if mapping[:terminal]
        attrs[:expires_at] = 1.year.from_now if mapped_status.to_s == "clear" && !includes_canceled
        check.update!(attrs)

        rec.background_check_id = check.id
        sync_badge_and_profile(check)
        VerificationEventNotifier.background_check_result(check.user, check)

        {
          outcome: "processed",
          hydrated: hydrated,
          background_check_id: check.id,
          provider_status: object["status"],
          provider_result: object["result"],
          assessment: provider_assessment,
          includes_canceled: includes_canceled,
          processing_error: nil
        }
      end

      def extract_object(event)
        nested = event.dig("data", "object")
        return nested if nested.is_a?(Hash)

        direct = event["data"]
        return direct if direct.is_a?(Hash)

        {}
      end

      def hydrate_object(event, object)
        return [object, false] unless object.is_a?(Hash)

        event_type = event["type"].to_s
        resource_type = object["object"].to_s
        return hydrate_report_object(resolve_report_id(event_type, object, object["id"]), object) if report_event?(event_type) || resource_type == "report"
        return hydrate_invitation_object(object) if invitation_event?(event_type) || resource_type == "invitation"

        [object, false]
      end

      def hydrate_report_object(report_id, object)
        return [object, false] unless report_id.present?
        return [object, false] unless object_needs_report_hydration?(object)
        return [object, false] unless valid_checkr_id?(report_id)

        client = CheckrClient.new
        return [object, false] unless client.configured?

        [client.get_report(report_id: report_id), true]
      rescue CheckrClient::Error => e
        Rails.logger.warn("[checkr_webhook] report hydration failed: #{e.message}")
        CheckrWebhookMetrics.increment("webhook_hydration_failed", tags: { object_type: "report" })
        [object, false]
      end

      def hydrate_invitation_object(object)
        invitation_id = object["id"].presence || resource_id_from_uri(object["uri"], "invitations")
        return [object, false] unless invitation_id.present?
        return [object, false] unless object_needs_invitation_hydration?(object)
        return [object, false] unless valid_checkr_id?(invitation_id)

        client = CheckrClient.new
        return [object, false] unless client.configured?

        [client.get_invitation(invitation_id: invitation_id), true]
      rescue CheckrClient::Error => e
        Rails.logger.warn("[checkr_webhook] invitation hydration failed: #{e.message}")
        CheckrWebhookMetrics.increment("webhook_hydration_failed", tags: { object_type: "invitation" })
        [object, false]
      end

      def object_needs_report_hydration?(object)
        object["candidate_id"].blank? || object["status"].blank? || object["result"].blank?
      end

      def object_needs_invitation_hydration?(object)
        object["candidate_id"].blank? || object["status"].blank?
      end

      def resolve_report_id(event_type, object, fallback)
        return fallback unless report_event?(event_type) || object["object"].to_s == "report"

        candidate = object["id"].presence || object["report_id"].presence || resource_id_from_uri(object["uri"], "reports") || fallback
        valid_checkr_id?(candidate) ? candidate : nil
      end

      def resolve_invitation_id(event_type, object)
        if invitation_event?(event_type) || object["object"].to_s == "invitation"
          candidate = object["invitation_id"].presence || object["id"].presence || resource_id_from_uri(object["uri"], "invitations")
          return valid_checkr_id?(candidate) ? candidate : nil
        end

        candidate = object["invitation_id"].presence
        valid_checkr_id?(candidate) ? candidate : nil
      end

      def resource_id_from_uri(uri, resource_name)
        return nil if uri.blank?

        path = URI.parse(uri.to_s).path
        match = path.match(%r{/#{resource_name}/([^/]+)})
        id = match && match[1]
        valid_checkr_id?(id) ? id : nil
      rescue URI::InvalidURIError
        nil
      end

      def report_event?(event_type)
        event_type.to_s.start_with?("report.")
      end

      def invitation_event?(event_type)
        event_type.to_s.start_with?("invitation.")
      end

      def sync_badge_and_profile(check)
        profile = VerificationProfile.for_user!(check.user)
        if check.eligible_for_background_gate?
          VerificationBadge.set_active!(user: check.user, badge_type: "background_checked", source: check, expires_at: check.expires_at)
          profile.update!(background_status: :verified, last_verified_at: Time.current)
          update_technician_background_verified(check.user.technician_profile, true)
        else
          if check.failed? || check.manually_rejected? || check.normalized_status_value.in?(%w[report_post_adverse_action report_canceled canceled invitation_deleted invitation_expired])
            profile.update!(background_status: :rejected)
            update_technician_background_verified(check.user.technician_profile, false)
          elsif check.normalized_status_value.in?(%w[consider review_required report_disputed report_pre_adverse_action complete_with_canceled_screenings])
            profile.update!(background_status: :pending)
            update_technician_background_verified(check.user.technician_profile, false)
          end
        end
      rescue StandardError => e
        Rails.logger.warn("[checkr_webhook] profile sync failed for background_check_id=#{check.id}: #{e.class} #{e.message}")
      end

      def update_technician_background_verified(technician_profile, value)
        return if technician_profile.blank?

        unless technician_profile.update(background_verified: value)
          Rails.logger.warn(
            "[checkr_webhook] technician background flag update failed user_id=#{technician_profile.user_id} errors=#{technician_profile.errors.full_messages.join(', ')}"
          )
        end
      end

      def resolve_non_regressive_status(check, incoming_status, provider_updated_at:, current_provider_updated_at:)
        return incoming_status if incoming_status.blank?
        return incoming_status if check.blank?
        return incoming_status if provider_updated_at.present? && current_provider_updated_at.present? && provider_updated_at >= current_provider_updated_at
        return check.normalized_status_value if check.terminal_normalized_status? && !terminal_status?(incoming_status)

        incoming_status
      end

      def normalized_to_legacy_status(normalized_status)
        case normalized_status.to_s
        when "invitation_sent" then :invited
        when "invitation_completed", "report_pending", "report_resumed", "pending" then :pending
        when "report_suspended" then :suspended
        when "clear" then :clear
        when "consider", "review_required", "report_disputed", "complete_with_canceled_screenings" then :consider
        when "canceled", "report_canceled", "invitation_expired", "invitation_deleted", "adverse_action_notice_not_delivered", "report_post_adverse_action" then :failed
        when "report_pre_adverse_action", "report_engaged", "report_complete" then :processing
        else
          :pending
        end
      end

      def extract_assess_status(object)
        direct = object["assessment"] || object["assess_status"] || object["assessment_status"]
        return direct if direct.present?

        assessments = Array(object["assessments"])
        latest = assessments.last
        latest.is_a?(Hash) ? (latest["status"] || latest["result"]) : nil
      end

      def parse_eta(raw_eta)
        return nil if raw_eta.blank?

        Time.zone.parse(raw_eta.to_s)
      rescue StandardError
        nil
      end

      def parse_provider_updated_at(object)
        raw = object["updated_at"] || object["completed_at"] || object["created_at"]
        return nil if raw.blank?

        Time.zone.parse(raw.to_s)
      rescue StandardError
        nil
      end

      def hydrate_authoritative_object(check, event_type:, object:, report_id:, invitation_id:)
        client = CheckrClient.new
        return [object, false] unless client.configured?

        if report_event?(event_type) || object["object"].to_s == "report" || report_id.present? || check.provider_report_id.present?
          id = report_id.presence || check.provider_report_id
          return [client.get_report(report_id: id), true] if valid_checkr_id?(id)
        end

        if invitation_event?(event_type) || object["object"].to_s == "invitation" || invitation_id.present? || check.provider_invitation_id.present?
          id = invitation_id.presence || check.provider_invitation_id
          return [client.get_invitation(invitation_id: id), true] if valid_checkr_id?(id)
        end

        [object, false]
      rescue CheckrClient::Error => e
        Rails.logger.warn("[checkr_webhook] authoritative refresh failed: #{e.message}")
        CheckrWebhookMetrics.increment("webhook_hydration_failed", tags: { object_type: object["object"], reason: "authoritative_refresh_failed" })
        [object, false]
      end

      def stale_event_for_check?(check, provider_updated_at, mapping)
        return false if check.blank?
        return false if provider_updated_at.blank?
        return false if check.provider_updated_at.blank?

        provider_updated_at < check.provider_updated_at && !mapping[:terminal]
      end

      def terminal_status?(normalized_status)
        normalized_status.to_s.in?(%w[
          clear
          complete_with_canceled_screenings
          consider
          report_complete
          report_canceled
          canceled
          invitation_expired
          invitation_deleted
          report_post_adverse_action
          adverse_action_notice_not_delivered
        ])
      end

      def valid_checkr_id?(value)
        value.to_s.match?(CHECKR_ID_REGEX)
      end

      def resolve_object_identity(event_type, object)
        object_type = object["object"].to_s.presence
        object_id =
          if report_event?(event_type)
            resolve_report_id(event_type, object, object["id"])
          elsif invitation_event?(event_type)
            resolve_invitation_id(event_type, object)
          else
            object["id"].to_s.presence
          end
        object_id = nil unless valid_checkr_id?(object_id)
        [object_type, object_id]
      end

      def metric_for_outcome(outcome)
        case outcome[:outcome].to_s
        when "unmatched_background_check"
          CheckrWebhookMetrics.increment("webhook_unmatched_object")
        when "recorded_no_identifiers"
          CheckrWebhookMetrics.increment("webhook_unknown_event")
        end
      end

      def elapsed_ms(started_at)
        ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round
      rescue StandardError
        nil
      end

      def log_event(event_id:, event_type:, object_type:, object_id:, background_check_id:, provider_status:, provider_result:, assessment:, includes_canceled:, hydrated:, duplicate:, outcome:, duration_ms:)
        Rails.logger.info(
          "[checkr_webhook] " \
          "checkr_event_id=#{event_id} event_type=#{event_type} object_type=#{object_type} object_id=#{object_id} " \
          "background_check_id=#{background_check_id} provider_status=#{provider_status} provider_result=#{provider_result} " \
          "assessment=#{assessment} includes_canceled=#{includes_canceled} hydrated=#{hydrated} duplicate=#{duplicate} " \
          "duration_ms=#{duration_ms} outcome=#{outcome}"
        )
      end

      def sanitized_event_payload(event)
        data_object = extract_object(event)
        {
          id: event["id"],
          type: event["type"],
          data: {
            id: data_object["id"],
            invitation_id: data_object["invitation_id"],
            report_id: data_object["report_id"],
            candidate_id: data_object["candidate_id"],
            status: data_object["status"],
            result: data_object["result"],
            includes_canceled: data_object["includes_canceled"],
            adjudication: data_object["adjudication"],
            assessment: data_object["assessment"] || data_object["assessment_status"] || data_object["assess_status"],
            eta: data_object["eta"],
            estimated_completion_time: data_object["estimated_completion_time"],
            uri: data_object["uri"],
            object: data_object["object"]
          }.compact
        }
      end
    end
  end
end
