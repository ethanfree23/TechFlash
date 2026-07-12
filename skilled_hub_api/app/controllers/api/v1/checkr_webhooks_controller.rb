module Api
  module V1
    class CheckrWebhooksController < ActionController::API
      def create
        payload = request.body.read
        signature = request.env["HTTP_CHECKR_SIGNATURE"].to_s
        secret = ENV["CHECKR_WEBHOOK_SECRET"].presence || Rails.application.credentials.dig(:checkr, :webhook_secret).presence

        if secret.blank?
          Rails.logger.error("[checkr_webhook] missing webhook secret")
          return head :service_unavailable
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

      def valid_signature?(payload, signature, secret)
        expected = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
        ActiveSupport::SecurityUtils.secure_compare(expected, signature)
      rescue StandardError
        false
      end

      def process_event(event)
        object = event["data"] || {}
        invitation_id = object["invitation_id"] || object["id"]
        report_id = object["report_id"] || object["id"]
        candidate_id = object["candidate_id"]
        return if invitation_id.blank? && report_id.blank? && candidate_id.blank?

        check = BackgroundCheck.where(provider: "checkr")
          .where("provider_invitation_id = ? OR provider_report_id = ? OR provider_candidate_id = ?", invitation_id, report_id, candidate_id)
          .order(created_at: :desc)
          .first
        return if check.blank?

        mapped_status = map_status(event["type"], object["status"], object["result"])
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
          if check.user.technician_profile.present?
            check.user.technician_profile.update!(background_verified: true)
          end
        else
          profile.update!(background_status: :rejected) if check.failed? || check.manually_rejected? || check.consider?
          if check.user.technician_profile.present? && (check.failed? || check.manually_rejected? || check.consider?)
            check.user.technician_profile.update!(background_verified: false)
          end
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
        data = event["data"] || {}
        {
          id: event["id"],
          type: event["type"],
          data: {
            id: data["id"],
            invitation_id: data["invitation_id"],
            report_id: data["report_id"],
            candidate_id: data["candidate_id"],
            status: data["status"],
            result: data["result"],
            eta: data["eta"],
            estimated_completion_time: data["estimated_completion_time"]
          }.compact
        }
      end
    end
  end
end
