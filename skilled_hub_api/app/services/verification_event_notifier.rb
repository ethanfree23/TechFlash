class VerificationEventNotifier
  class << self
    def reference_request_created(reference)
      response_url = "#{frontend_base_url}/references/respond/#{reference.request_token}"
      MailDelivery.safe_deliver do
        UserMailer.reference_request_email(
          to_email: reference.email,
          reference_name: reference.full_name,
          technician_name: technician_name(reference.technician_user),
          response_url: response_url
        ).deliver_now
      end

      if reference.phone.present?
        body = "TechFlash reference request for #{technician_name(reference.technician_user)}. Submit here: #{response_url}"
        log = SmsDeliveryLog.create!(
          user_id: reference.technician_user_id,
          category: "reference_request",
          destination: reference.phone.to_s,
          message: body,
          status: "queued"
        )
        result = SmsDeliveryService.deliver!(to: reference.phone, body: body)
        log.update!(
          status: sms_status(result[:status]),
          error_message: result[:error].presence
        )
      end
    rescue StandardError => e
      Rails.logger.warn("VerificationEventNotifier.reference_request_created: #{e.class} #{e.message}")
    end

    def background_payment_required(user, background_check)
      create_app_notification(
        user: user,
        category: "verification",
        title: "Background check payment required",
        body: "Complete payment to start your background check.",
        metadata: { background_check_id: background_check.id, payment_status: background_check.payment_status }
      )
      safe_user_mail(user, :membership_updates) do
        UserMailer.background_check_payment_required_email(user, background_check).deliver_now
      end
    end

    def background_payment_completed(user, background_check)
      create_app_notification(
        user: user,
        category: "verification",
        title: "Background check payment confirmed",
        body: "Payment received. Your Checkr invitation is ready.",
        metadata: { background_check_id: background_check.id }
      )
      safe_user_mail(user, :membership_updates) do
        UserMailer.background_check_payment_completed_email(user, background_check).deliver_now
      end
    end

    def background_check_started(user, background_check)
      create_app_notification(
        user: user,
        category: "verification",
        title: "Background check in progress",
        body: "Your Checkr invitation was issued. Complete required steps to finish verification.",
        metadata: { background_check_id: background_check.id, status: background_check.status }
      )
      safe_user_mail(user, :membership_updates) do
        UserMailer.background_check_started_email(user, background_check).deliver_now
      end
    end

    def background_check_result(user, background_check)
      title =
        if background_check.eligible_for_background_gate?
          "Background check verified"
        else
          "Background check requires review"
        end
      body =
        if background_check.eligible_for_background_gate?
          "Your background check is verified and your badge is active."
        else
          "Your background check result is #{background_check.status}. Trust & Safety will review if needed."
        end
      create_app_notification(
        user: user,
        category: "verification",
        title: title,
        body: body,
        metadata: { background_check_id: background_check.id, status: background_check.status, result: background_check.result }
      )
      safe_user_mail(user, :membership_updates) do
        UserMailer.background_check_result_email(user, background_check).deliver_now
      end
    end

    def document_reviewed(user, document)
      create_app_notification(
        user: user,
        category: "verification",
        title: "Document #{document.status}",
        body: "Your #{document.doc_type} document was #{document.status}.",
        metadata: { document_id: document.id, status: document.status, doc_type: document.doc_type }
      )
    end

    def reference_reviewed(user, reference)
      create_app_notification(
        user: user,
        category: "verification",
        title: "Reference #{reference.status}",
        body: "A reference from #{reference.full_name} was #{reference.status}.",
        metadata: { reference_id: reference.id, status: reference.status }
      )
    end

    private

    def create_app_notification(user:, category:, title:, body:, metadata: {})
      AppNotification.create!(
        user_id: user.id,
        category: category,
        title: title,
        body: body,
        metadata: metadata
      )
    rescue StandardError => e
      Rails.logger.warn("VerificationEventNotifier.create_app_notification: #{e.class} #{e.message}")
    end

    def safe_user_mail(user, category)
      return unless user.present?
      return unless user.email_notifications_enabled?
      return unless user.email_notification_enabled_for?(category)

      MailDelivery.safe_deliver { yield }
    rescue StandardError => e
      Rails.logger.warn("VerificationEventNotifier.safe_user_mail: #{e.class} #{e.message}")
    end

    def sms_status(status)
      case status
      when :sent then "sent"
      when :skipped then "skipped"
      else "failed"
      end
    end

    def frontend_base_url
      ENV.fetch("FRONTEND_URL", "http://localhost:5173").to_s.chomp("/")
    end

    def technician_name(user)
      [user&.first_name, user&.last_name].map(&:presence).compact.join(" ").presence || user&.email || "a TechFlash technician"
    end
  end
end
