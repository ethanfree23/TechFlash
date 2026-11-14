# frozen_string_literal: true

module TrustSafety
  # Serializes review items (background checks, documents, references) into the unified
  # shape the admin queue and review drawer consume. Never emits raw provider payloads.
  class ItemSerializer
    extend ActiveStorageUrlHelper

    SLA_MEDIUM_DAYS = 3
    SLA_HIGH_DAYS = 7

    class << self
      def item_key(type, id)
        "#{type}:#{id}"
      end

      # --- Background checks -------------------------------------------------------

      def background_check(check, identity:, detail: false)
        display = BackgroundCheckPolicy.display_status(check)
        provider = BackgroundCheckPolicy.presentation(check)
        submitted_at = check.started_at || check.created_at
        payload = {
          key: item_key("background_check", check.id),
          item_type: "background_check",
          id: check.id,
          technician: identity,
          review_type_label: "Background Check",
          title: package_label(check),
          subtitle: [check.provider.to_s.titleize.presence, check.provider_report_id.present? ? "Report #{check.provider_report_id}" : nil].compact.join(" · ").presence,
          status: display,
          provider_status: provider,
          needs_review: BackgroundCheckPolicy.needs_review?(check),
          flagged: BackgroundCheckPolicy.flagged?(check),
          submitted_at: submitted_at&.iso8601,
          updated_at: check.updated_at&.iso8601,
          expires_at: check.expires_at&.iso8601,
          action_reason: BackgroundCheckPolicy.action_reason(check),
          priority: background_check_priority(check, submitted_at),
          actions: BackgroundCheckPolicy.actions(check),
          override_block_reason: BackgroundCheckPolicy.allowed_overrides(check).empty? ? BackgroundCheckPolicy.override_block_reason(check) : nil,
          eligibility: {
            eligible_for_verified_badge: check.eligible_for_background_gate?,
            profile_flag_background_verified: identity&.dig(:background_verified) == true
          },
          reviewer_decision: {
            override_status: check.admin_override_status.to_s == "none" ? nil : check.admin_override_status,
            notes: check.admin_notes.to_s.start_with?("INVITATION_OUTCOME_UNKNOWN:") ? nil : check.admin_notes.presence
          }
        }
        payload.merge!(background_check_detail(check)) if detail
        payload
      end

      def background_check_detail(check)
        {
          checkr: {
            candidate_id: check.provider_candidate_id,
            invitation_id: check.provider_invitation_id,
            report_id: check.provider_report_id,
            package_name: check.package_name,
            node_custom_id: check.node_custom_id,
            provider_status: check.provider_status,
            result: check.result,
            assess_status: check.provider_assess_status,
            adjudication: check.provider_adjudication,
            includes_canceled: check.provider_includes_canceled,
            provider_updated_at: check.provider_updated_at&.iso8601,
            report_eta_at: check.report_eta_at&.iso8601,
            # Admin-only Checkr dashboard link. Raw report contents are never proxied.
            dashboard_url: check.dashboard_url.presence || check.report_url.presence,
            invitation_url: check.invitation_url.presence,
            work_location: [check.work_location_city, check.work_location_state, check.work_location_country].compact.join(", ").presence,
            last_webhook_event_id: check.last_webhook_event_id,
            last_webhook: last_webhook_payload(check)
          },
          lifecycle: {
            status: check.status,
            normalized_status: check.normalized_status_value,
            started_at: check.started_at&.iso8601,
            completed_at: check.completed_at&.iso8601,
            expires_at: check.expires_at&.iso8601,
            created_at: check.created_at&.iso8601,
            payment_status: check.payment_status,
            paid_by: check.paid_by,
            disclosure_accepted_at: check.disclosure_accepted_at&.iso8601,
            authorization_accepted_at: check.authorization_accepted_at&.iso8601
          },
          processing_errors: processing_errors(check),
          job_context: {
            job_id: check.job_id,
            job_application_id: check.job_application_id,
            company_profile_id: check.company_profile_id
          }.compact
        }
      end

      def last_webhook_payload(check)
        return nil if check.last_webhook_event_id.blank?

        event = CheckrWebhookEvent.find_by(checkr_event_id: check.last_webhook_event_id)
        return nil unless event

        {
          event_type: event.event_type,
          received_at: event.received_at&.iso8601,
          processed_at: event.processed_at&.iso8601,
          processing_error: event.processing_error.presence
        }
      end

      def processing_errors(check)
        errors = CheckrWebhookEvent.where(background_check_id: check.id).where.not(processing_error: [nil, ""]).order(updated_at: :desc).limit(5)
        rows = errors.map do |row|
          { checkr_event_id: row.checkr_event_id, event_type: row.event_type, processing_error: row.processing_error, attempt_count: row.attempt_count, updated_at: row.updated_at&.iso8601 }
        end
        if check.failed? && check.admin_notes.to_s.start_with?("INVITATION_OUTCOME_UNKNOWN:")
          rows.unshift(checkr_event_id: nil, event_type: "invitation", processing_error: check.admin_notes.to_s, attempt_count: nil, updated_at: check.updated_at&.iso8601)
        end
        rows
      end

      def package_label(check)
        name = check.package_name.to_s.strip
        return "Checkr background check" if name.blank?

        "#{name.tr('_', ' ').titleize} package"
      end

      def background_check_priority(check, submitted_at)
        if BackgroundCheckPolicy.error?(check)
          return { level: "high", reason: "Processing error requires reconciliation" }
        end
        if BackgroundCheckPolicy.needs_review?(check)
          phase = BackgroundCheckPolicy.phase(check)
          return { level: "high", reason: phase.in?(%w[report_disputed report_pre_adverse_action]) ? "Lawful process in flight — monitor closely" : "Provider result requires adjudication" }
        end
        if check.expires_at.present? && check.expires_at <= 30.days.from_now && check.eligible_for_background_gate?
          return { level: "medium", reason: "Verification expires within 30 days" }
        end
        age_priority(submitted_at, pending: BackgroundCheckPolicy.in_progress?(check))
      end

      # --- Documents -------------------------------------------------------------------

      def document(doc, identity:, detail: false, file_access: nil)
        display = DocumentPolicy.display_status(doc)
        has_file = blob_file_present?(doc.file)
        payload = {
          key: item_key("document", doc.id),
          item_type: "document",
          id: doc.id,
          technician: identity,
          review_type_label: DocumentPolicy.type_label(doc),
          document_category: DocumentPolicy.category(doc),
          doc_type: doc.doc_type,
          title: DocumentPolicy.title(doc) || DocumentPolicy.type_label(doc),
          subtitle: document_subtitle(doc),
          status: display,
          needs_review: DocumentPolicy.needs_review?(doc),
          flagged: false,
          submitted_at: doc.created_at&.iso8601,
          updated_at: doc.updated_at&.iso8601,
          expires_at: doc.valid_until&.iso8601,
          action_reason: DocumentPolicy.action_reason(doc),
          priority: document_priority(doc),
          actions: DocumentPolicy.actions(doc),
          has_file: has_file,
          sensitive: DocumentPolicy.sensitive?(doc),
          verification_note: "Uploaded by the technician. Reviewer approval confirms the document looks valid; it is not an issuing-authority verification.",
          reviewer_decision: {
            status: doc.status,
            reviewed_at: doc.reviewed_at&.iso8601,
            reviewer: user_summary(doc.reviewed_by_user),
            rejection_reason: doc.rejection_reason.presence
          }
        }
        if detail
          payload[:details] = {
            issuer: DocumentPolicy.title(doc),
            document_number: DocumentPolicy.document_number(doc),
            issued_on: doc.issued_on&.iso8601,
            valid_until: doc.valid_until&.iso8601,
            expired: DocumentPolicy.expired?(doc),
            expiring_soon: DocumentPolicy.expiring_soon?(doc),
            metadata: safe_metadata(doc.metadata),
            uploadable_type: doc.uploadable_type,
            uploadable_id: doc.uploadable_id
          }
          payload[:file] = file_access
        end
        payload
      end

      def document_subtitle(doc)
        parts = []
        number = DocumentPolicy.document_number(doc)
        parts << "No. #{number}" if number
        parts << "Expires #{doc.valid_until.strftime('%b %-d, %Y')}" if doc.valid_until.present?
        parts.join(" · ").presence
      end

      def document_priority(doc)
        if doc.pending_review? && DocumentPolicy.expired?(doc)
          return { level: "high", reason: "Submitted credential is already expired" }
        end
        if doc.approved? && DocumentPolicy.expired?(doc)
          return { level: "medium", reason: "Approved credential has expired" }
        end
        if doc.approved? && DocumentPolicy.expiring_soon?(doc)
          return { level: "medium", reason: "Credential expires within 30 days" }
        end
        age_priority(doc.created_at, pending: doc.pending_review?)
      end

      def safe_metadata(metadata)
        return {} unless metadata.is_a?(Hash)

        metadata.slice("identity_document_type", "title", "state", "issuing_state", "class", "ocr_confidence").compact
      end

      # --- References ----------------------------------------------------------------------

      def reference(ref, identity:, detail: false)
        display = ReferencePolicy.display_status(ref)
        payload = {
          key: item_key("reference", ref.id),
          item_type: "reference",
          id: ref.id,
          technician: identity,
          review_type_label: "Professional Reference",
          title: ref.full_name,
          subtitle: [ref.relationship.presence, ref.company_name.presence].compact.join(" · ").presence,
          status: display,
          needs_review: ReferencePolicy.needs_review?(ref),
          flagged: false,
          submitted_at: (ref.responded_at || ref.requested_at || ref.created_at)&.iso8601,
          updated_at: ref.updated_at&.iso8601,
          expires_at: nil,
          action_reason: ReferencePolicy.action_reason(ref),
          priority: age_priority(ref.responded_at || ref.created_at, pending: ref.responded?),
          actions: ReferencePolicy.actions(ref),
          reviewer_decision: {
            status: ref.status,
            reviewed_at: ref.reviewed_at&.iso8601,
            reviewer: user_summary(ref.reviewed_by_user),
            review_notes: ref.review_notes.presence
          }
        }
        if detail
          payload[:details] = {
            full_name: ref.full_name,
            relationship: ref.relationship,
            company_name: ref.company_name.presence,
            email: ref.email.presence,
            phone: ref.phone.presence,
            requested_at: ref.requested_at&.iso8601,
            responded_at: ref.responded_at&.iso8601,
            answers: ref.answers.is_a?(Hash) ? ref.answers : {}
          }
        end
        payload
      end

      # --- Shared ----------------------------------------------------------------------------

      def user_summary(user)
        return nil unless user

        name = [user.first_name, user.last_name].map(&:presence).compact.join(" ").presence
        { id: user.id, name: name || user.email, email: user.email }
      end

      def age_priority(since, pending:)
        return { level: "normal", reason: nil } unless pending && since.present?

        days = ((Time.current - since.to_time) / 1.day).floor
        return { level: "high", reason: "Waiting #{days} days — past review SLA" } if days >= SLA_HIGH_DAYS
        return { level: "medium", reason: "Waiting #{days} days" } if days >= SLA_MEDIUM_DAYS

        { level: "normal", reason: nil }
      end
    end
  end
end
