# frozen_string_literal: true

module TrustSafety
  # Classification, display and permitted actions for uploaded technician documents.
  module DocumentPolicy
    module_function

    CREDENTIAL_TYPES = %w[license certificate cert].freeze
    IDENTITY_TYPES = %w[identity drivers_license passport].freeze
    INSURANCE_TYPES = %w[insurance insurance_certificate coi].freeze
    REVIEWABLE_TYPES = (CREDENTIAL_TYPES + IDENTITY_TYPES + INSURANCE_TYPES).freeze

    TYPE_LABELS = {
      "license" => "Trade License",
      "certificate" => "Trade Certification",
      "cert" => "Trade Certification",
      "identity" => "Identity Document",
      "drivers_license" => "Driver's License",
      "passport" => "Passport",
      "insurance" => "Insurance Certificate",
      "insurance_certificate" => "Insurance Certificate",
      "coi" => "Certificate of Insurance"
    }.freeze

    PLACEHOLDER_TITLES = ["self-reported via ghl intake", "trade license", "ghl_self_reported"].freeze
    PLACEHOLDER_NUMBERS = %w[ghl_self_reported].freeze

    def category(doc)
      type = doc.doc_type.to_s.downcase
      return "credential" if CREDENTIAL_TYPES.include?(type)
      return "identity" if IDENTITY_TYPES.include?(type)
      return "insurance" if INSURANCE_TYPES.include?(type)

      "other"
    end

    def type_label(doc)
      TYPE_LABELS[doc.doc_type.to_s.downcase] || doc.doc_type.to_s.humanize.presence || "Document"
    end

    def sensitive?(doc)
      category(doc) == "identity"
    end

    def title(doc)
      meta_title = metadata_value(doc, "title").presence || metadata_value(doc, "credential_name").presence
      return meta_title if meta_title.present?

      raw = doc.issuer.to_s.strip
      return nil if raw.blank? || PLACEHOLDER_TITLES.include?(raw.downcase)

      raw
    end

    def metadata_value(doc, key)
      return nil unless doc.metadata.is_a?(Hash)

      doc.metadata[key].to_s.strip.presence || doc.metadata[key.to_sym].to_s.strip.presence
    end

    def document_number(doc)
      raw = doc.document_number.to_s.strip
      return nil if raw.blank? || PLACEHOLDER_NUMBERS.include?(raw.downcase)

      raw
    end

    def expired?(doc)
      doc.valid_until.present? && doc.valid_until < Date.current
    end

    def expiring_soon?(doc, within: 30.days)
      doc.valid_until.present? && !expired?(doc) && doc.valid_until <= (Date.current + within)
    end

    # pending_review | approved | rejected | expired
    def effective_status(doc)
      return "expired" if doc.approved? && expired?(doc)

      doc.status.to_s
    end

    def display_status(doc)
      case effective_status(doc)
      when "pending_review" then { key: "pending_review", label: "Awaiting Review", tone: "warning", group: "pending" }
      when "approved" then { key: "approved", label: "Approved", tone: "success", group: "approved" }
      when "rejected" then { key: "rejected", label: "Rejected", tone: "danger", group: "rejected" }
      when "expired" then { key: "expired", label: "Expired", tone: "neutral", group: "expired" }
      else { key: doc.status.to_s, label: doc.status.to_s.humanize, tone: "neutral", group: "other" }
      end
    end

    def needs_review?(doc)
      doc.pending_review?
    end

    def actions(doc)
      if doc.pending_review?
        [
          { key: "approve", label: "Approve", tone: "success", requires_reason: false, requires_confirmation: true,
            consequence: approve_consequence(doc) },
          { key: "reject", label: "Reject", tone: "danger", requires_reason: true, requires_confirmation: true,
            consequence: "The technician is notified and must upload a corrected document. The rejection reason is shown to them." },
          { key: "request_info", label: "Request more information", tone: "neutral", requires_reason: true, requires_confirmation: false,
            consequence: "Sends the technician an in-app request. The document stays in the review queue." },
          { key: "note", label: "Add reviewer note", tone: "neutral", requires_reason: true, requires_confirmation: false }
        ]
      else
        [
          { key: doc.approved? ? "reject" : "approve",
            label: doc.approved? ? "Override: reject" : "Override: approve",
            tone: doc.approved? ? "danger" : "success",
            requires_reason: true, requires_confirmation: true, override: true,
            consequence: "Reverses a previous reviewer decision. Requires a written reason and is recorded in the audit log." },
          { key: "note", label: "Add reviewer note", tone: "neutral", requires_reason: true, requires_confirmation: false }
        ]
      end
    end

    def approve_consequence(doc)
      case category(doc)
      when "credential" then "Marks the technician's trade credential as verified and activates the license badge. This does not confirm the license with the issuing authority."
      when "identity" then "Marks identity verification complete for this technician."
      when "insurance" then "Marks the insurance certificate as verified."
      else "Marks this document as approved."
      end
    end

    def action_reason(doc)
      status = effective_status(doc)
      return "Uploaded #{type_label(doc).downcase} awaiting reviewer decision." if status == "pending_review"
      return "Approved credential has passed its expiration date." if status == "expired"
      return "Approved credential expires within 30 days." if doc.approved? && expiring_soon?(doc)

      nil
    end
  end
end
