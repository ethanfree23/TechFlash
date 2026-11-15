# frozen_string_literal: true

module TrustSafety
  # Operational metrics for the Trust & Safety header. Each metric maps to a queue filter
  # so the cards double as navigation.
  class Summary
    EXPIRING_WINDOW = 30.days

    def self.call
      new.call
    end

    def call
      technician_docs = Document.where(uploadable_type: "TechnicianProfile", doc_type: DocumentPolicy::REVIEWABLE_TYPES)
      pending_docs = technician_docs.where(status: :pending_review).count
      pending_refs = VerificationReference.where(status: :responded).count
      bg_needs_review = background_needs_review_count
      bg_pending = BackgroundCheck
        .where(normalized_status: BackgroundCheckPolicy::IN_PROGRESS_PHASES + BackgroundCheckPolicy::SUSPENDED_PHASES)
        .or(BackgroundCheck.where(normalized_status: [nil, ""], status: BackgroundCheckPolicy::LEGACY_IN_PROGRESS))
        .count
      anomalies = CheckrWebhookEvent.where.not(processing_error: [nil, ""]).where(processed_at: nil).count
      expiring_docs = technician_docs.where(status: :approved)
        .where("documents.valid_until IS NOT NULL AND documents.valid_until >= ? AND documents.valid_until <= ?", Date.current, (Date.current + EXPIRING_WINDOW))
        .count
      expired_docs = technician_docs.where(status: :approved).where("documents.valid_until IS NOT NULL AND documents.valid_until < ?", Date.current).count
      expiring_checks = BackgroundCheck.where(status: %i[clear manually_approved])
        .where("background_checks.expires_at IS NOT NULL AND background_checks.expires_at >= ? AND background_checks.expires_at <= ?", Time.current, EXPIRING_WINDOW.from_now)
        .count
      total_technicians = TechnicianProfile.count
      verified = TechnicianProfile.where(background_verified: true).count

      {
        needs_review: {
          value: pending_docs + pending_refs + bg_needs_review,
          breakdown: { credentials: pending_docs, references: pending_refs, background_checks: bg_needs_review },
          filter: { tab: "queue", status: "needs_review", review_type: "all" }
        },
        background_checks_pending: {
          value: bg_pending,
          footnote: "Invited, processing or suspended at Checkr",
          filter: { tab: "queue", status: "pending", review_type: "background_check" }
        },
        credentials_awaiting_review: {
          value: pending_docs,
          footnote: "Licenses, certifications, identity & insurance uploads",
          filter: { tab: "queue", status: "needs_review", review_type: "credential" }
        },
        references_awaiting_review: {
          value: pending_refs,
          footnote: "References that responded and await a decision",
          filter: { tab: "queue", status: "needs_review", review_type: "reference" }
        },
        flagged: {
          value: bg_needs_review + anomalies,
          breakdown: { background_checks: bg_needs_review, webhook_anomalies: anomalies },
          footnote: anomalies.positive? ? "#{anomalies} unprocessed Checkr webhook #{'error'.pluralize(anomalies)}" : "Consider, disputed, adverse or errored checks",
          filter: { tab: "queue", status: "flagged", review_type: "background_check" }
        },
        verified_technicians: {
          value: verified,
          footnote: total_technicians.positive? ? "#{((verified.to_f / total_technicians) * 100).round}% of #{total_technicians} technicians background-verified" : "No technicians yet",
          filter: { tab: "technicians", verification: "verified" }
        },
        expiring_credentials: {
          value: expiring_docs + expired_docs + expiring_checks,
          breakdown: { expiring_documents: expiring_docs, expired_documents: expired_docs, expiring_background_checks: expiring_checks },
          footnote: "Within 30 days, including already-expired approved credentials",
          filter: { tab: "queue", status: "expired", review_type: "all" }
        },
        totals: {
          technicians: total_technicians,
          webhook_anomalies: anomalies
        },
        generated_at: Time.current.iso8601
      }
    end

    private

    def background_needs_review_count
      BackgroundCheck
        .where(normalized_status: BackgroundCheckPolicy::NEEDS_REVIEW_PHASES)
        .or(BackgroundCheck.where(normalized_status: [nil, ""], status: BackgroundCheckPolicy::LEGACY_NEEDS_REVIEW))
        .or(BackgroundCheck.where(status: :failed))
        .where(admin_override_status: :none)
        .count
    end
  end
end
