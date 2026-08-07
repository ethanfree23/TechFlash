module Api
  module V1
    class CheckrWebhooksController < ActionController::API
      def create
        checkr_configuration = CheckrConfiguration.new
        return head :ok unless checkr_configuration.requests_allowed?

        payload = request.body.read
        signature = request.headers["X-Checkr-Signature"].to_s.presence || request.env["HTTP_X_CHECKR_SIGNATURE"].to_s
        secret = signing_secret(checkr_configuration)

        if secret.blank?
          Rails.logger.warn("[checkr_webhook] missing signing secret")
          return head :ok
        end
        return head :unauthorized unless valid_signature?(payload, signature, secret)

        event = JSON.parse(payload)
        event_id = event["id"].to_s
        return head :bad_request if event_id.blank?
        event_type = event["type"].to_s
        Rails.logger.info("[checkr_webhook] event_id=#{event_id} type=#{event_type}")

        existing = CheckrWebhookEvent.find_by(checkr_event_id: event_id)
        return head :ok if existing&.processed_at.present?

        CheckrWebhookEvent.transaction do
          rec = CheckrWebhookEvent.lock.find_or_initialize_by(checkr_event_id: event_id)
          next if rec.processed_at.present?

          rec.event_type = event_type
          rec.payload = sanitized_event_payload(event).to_json
          rec.save!
          process_event(event)
          rec.update!(processed_at: Time.current)
        end

        head :ok
      rescue JSON::ParserError
        head :bad_request
      end

      private

      def signing_secret(checkr_configuration)
        api_key = checkr_configuration.api_key.to_s.presence
        return api_key if api_key.present?

        legacy_secret = checkr_configuration.webhook_secret.to_s.presence
        if legacy_secret.present?
          Rails.logger.warn("[checkr_webhook] legacy webhook secret fallback in use")
        end
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

      def process_event(event)
        event_type = event["type"].to_s
        object = extract_object(event)
        object = hydrate_object(event, object)
        invitation_id = resolve_invitation_id(event_type, object)
        report_id = resolve_report_id(event_type, object, object["report_id"])
        candidate_id = object["candidate_id"]
        return if invitation_id.blank? && report_id.blank? && candidate_id.blank?

        check = BackgroundCheck.where(provider: "checkr")
          .where("provider_invitation_id = ? OR provider_report_id = ? OR provider_candidate_id = ?", invitation_id, report_id, candidate_id)
          .order(created_at: :desc)
          .first
        return if check.blank?

        object = hydrate_report_object(report_id, object) if report_id.present? && (report_event?(event_type) || object["object"].to_s == "report")

        mapped_status = map_status(event_type, object["status"], object["result"])
        mapped_status = resolve_non_regressive_status(check, mapped_status)

        attrs = {
          status: normalized_to_legacy_status(mapped_status),
          normalized_status: mapped_status,
          last_webhook_event_id: event["id"]
        }
        attrs[:result] = object["result"] if object["result"].present?
        attrs[:provider_report_id] = report_id if report_id.present?
        attrs[:provider_status] = object["status"] if object["status"].present?
        attrs[:provider_assess_status] = extract_assess_status(object)
        attrs[:invitation_url] = object["invitation_url"] if object["invitation_url"].present?
        attrs[:report_url] = object["report_url"] || object["uri"] if (object["report_url"].present? || object["uri"].present?)
        attrs[:dashboard_url] = object["dashboard_url"] if object["dashboard_url"].present?
        attrs[:report_eta_at] = parse_eta(object["eta"] || object["estimated_completion_time"])
        attrs[:completed_at] = Time.current if %w[clear consider report_complete canceled].include?(mapped_status.to_s)
        attrs[:expires_at] = 1.year.from_now if mapped_status.to_s == "clear"
        check.update!(attrs)

        sync_badge_and_profile(check)
        VerificationEventNotifier.background_check_result(check.user, check)
      end

      def extract_object(event)
        nested = event.dig("data", "object")
        return nested if nested.is_a?(Hash)

        direct = event["data"]
        return direct if direct.is_a?(Hash)

        {}
      end

      def hydrate_object(event, object)
        return object unless object.is_a?(Hash)

        event_type = event["type"].to_s
        resource_type = object["object"].to_s
        return hydrate_report_object(resolve_report_id(event_type, object, object["id"]), object) if report_event?(event_type) || resource_type == "report"
        return hydrate_invitation_object(object) if invitation_event?(event_type) || resource_type == "invitation"

        object
      end

      def hydrate_report_object(report_id, object)
        return object unless report_id.present?
        return object unless object_needs_report_hydration?(object)

        client = CheckrClient.new
        return object unless client.configured?

        client.get_report(report_id: report_id)
      rescue CheckrClient::Error => e
        Rails.logger.warn("[checkr_webhook] report hydration failed: #{e.message}")
        object
      end

      def hydrate_invitation_object(object)
        invitation_id = object["id"].presence || resource_id_from_uri(object["uri"], "invitations")
        return object unless invitation_id.present?
        return object unless object_needs_invitation_hydration?(object)

        client = CheckrClient.new
        return object unless client.configured?

        client.get_invitation(invitation_id: invitation_id)
      rescue CheckrClient::Error => e
        Rails.logger.warn("[checkr_webhook] invitation hydration failed: #{e.message}")
        object
      end

      def object_needs_report_hydration?(object)
        object["candidate_id"].blank? || object["status"].blank? || object["result"].blank?
      end

      def object_needs_invitation_hydration?(object)
        object["candidate_id"].blank? || object["status"].blank?
      end

      def resolve_report_id(event_type, object, fallback)
        return fallback unless report_event?(event_type) || object["object"].to_s == "report"

        object["id"].presence || object["report_id"].presence || resource_id_from_uri(object["uri"], "reports") || fallback
      end

      def resolve_invitation_id(event_type, object)
        return object["invitation_id"].presence || object["id"].presence || resource_id_from_uri(object["uri"], "invitations") if invitation_event?(event_type) || object["object"].to_s == "invitation"

        object["invitation_id"].presence
      end

      def resource_id_from_uri(uri, resource_name)
        path = URI.parse(uri.to_s).path
        match = path.match(%r{/#{resource_name}/([^/]+)})
        match && match[1]
      rescue URI::InvalidURIError
        nil
      end

      def report_event?(event_type)
        event_type.to_s.start_with?("report.")
      end

      def invitation_event?(event_type)
        event_type.to_s.start_with?("invitation.")
      end

      def map_status(event_type, provider_status, provider_result)
        case event_type.to_s
        when "invitation.created" then "invitation_sent"
        when "invitation.completed" then "invitation_completed"
        when "invitation.expired", "invitation.canceled" then "canceled"
        when "report.pending" then "report_pending"
        when "report.suspended" then "report_suspended"
        when "report.completed"
          return "clear" if provider_result.to_s == "clear"
          return "consider" if provider_result.to_s == "consider"
          return "report_complete" if provider_result.to_s == "pending"
          "report_complete"
        else
          normalize_provider_status(provider_status)
        end
      end

      def sync_badge_and_profile(check)
        profile = VerificationProfile.for_user!(check.user)
        if check.eligible_for_background_gate?
          VerificationBadge.set_active!(user: check.user, badge_type: "background_checked", source: check, expires_at: check.expires_at)
          profile.update!(background_status: :verified, last_verified_at: Time.current)
          update_technician_background_verified(check.user.technician_profile, true)
        else
          profile.update!(background_status: :rejected) if check.failed? || check.manually_rejected? || check.consider?
          if check.failed? || check.manually_rejected? || check.consider?
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

      def normalize_provider_status(provider_status)
        value = provider_status.to_s
        return "report_pending" if value.in?(%w[pending processing])
        return "report_suspended" if value == "suspended"
        return "clear" if value == "clear"
        return "consider" if value == "consider"
        return "canceled" if value.in?(%w[canceled cancelled expired withdrawn])
        return "invitation_completed" if value == "completed"

        "pending"
      end

      def resolve_non_regressive_status(check, incoming_status)
        return incoming_status if incoming_status.blank?

        current = check.normalized_status_value
        return incoming_status if current.blank?
        return incoming_status if normalized_status_rank(incoming_status) >= normalized_status_rank(current)

        current
      end

      def normalized_status_rank(status)
        {
          "not_started" => 0,
          "pending" => 1,
          "invitation_sent" => 2,
          "invitation_completed" => 3,
          "report_pending" => 4,
          "report_suspended" => 5,
          "report_complete" => 6,
          "canceled" => 7,
          "consider" => 8,
          "clear" => 9
        }[status.to_s] || 0
      end

      def normalized_to_legacy_status(normalized_status)
        case normalized_status.to_s
        when "invitation_sent" then :invited
        when "invitation_completed" then :pending
        when "report_pending" then :pending
        when "report_suspended" then :suspended
        when "report_complete" then :processing
        when "clear" then :clear
        when "consider" then :consider
        when "canceled" then :failed
        else
          :pending
        end
      end

      def extract_assess_status(object)
        direct = object["assess_status"] || object["assessment_status"]
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
