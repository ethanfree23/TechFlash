module Api
  module V1
    class CheckrWebhooksController < ActionController::API
      def create
        payload = request.body.read
        signature = request.env["HTTP_CHECKR_SIGNATURE"].to_s
        secret = ENV["CHECKR_WEBHOOK_SECRET"].presence || Rails.application.credentials.dig(:checkr, :webhook_secret).presence

        return head :ok if secret.blank?
        return head :bad_request unless valid_signature?(payload, signature, secret)

        event = JSON.parse(payload)
        event_id = event["id"].to_s
        return head :bad_request if event_id.blank?

        existing = CheckrWebhookEvent.find_by(checkr_event_id: event_id)
        return head :ok if existing&.processed_at.present?

        CheckrWebhookEvent.transaction do
          rec = CheckrWebhookEvent.lock.find_or_initialize_by(checkr_event_id: event_id)
          next if rec.processed_at.present?

          rec.event_type = event["type"]
          rec.payload = payload
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
        attrs = { status: mapped_status }
        attrs[:result] = object["result"] if object["result"].present?
        attrs[:provider_report_id] = report_id if report_id.present?
        attrs[:completed_at] = Time.current if %w[clear consider failed].include?(mapped_status.to_s)
        attrs[:expires_at] = 1.year.from_now if mapped_status.to_s == "clear"
        check.update!(attrs)

        sync_badge_and_profile(check)
        VerificationEventNotifier.background_check_result(check.user, check)
      end

      def map_status(event_type, provider_status, provider_result)
        case event_type.to_s
        when "invitation.created" then :invited
        when "invitation.completed" then :pending
        when "report.pending" then :pending
        when "report.suspended" then :suspended
        when "report.completed"
          return :clear if provider_result.to_s == "clear"
          return :consider if provider_result.to_s == "consider"
          :failed
        else
          provider_status_str = provider_status.to_s
          return :processing if provider_status_str == "processing"
          return :pending if provider_status_str == "pending"
          :failed
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
    end
  end
end
