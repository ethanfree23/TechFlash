# frozen_string_literal: true

module TrustSafety
  # Account-level trust checklist for a technician. Every row is derived from actual
  # records and the existing business rules (TechnicianVerificationInventory /
  # VerificationProfile); it never infers one requirement from another.
  class TrustProfile
    REFERENCES_REQUIRED_FOR_BADGE = 2

    def self.call(user)
      new(user).call
    end

    def initialize(user)
      @user = user
      @profile = user.technician_profile
    end

    def call
      return nil unless @profile

      identity = TechnicianIdentity.for(@user)
      inventory = TechnicianVerificationInventory.call(@user)
      verification = VerificationProfile.find_by(user_id: @user.id)
      checks = @user.background_checks.order(created_at: :desc, id: :desc).to_a
      documents = Document.where(uploadable: @profile).includes(:reviewed_by_user, file_attachment: :blob).order(created_at: :desc).to_a
      references = VerificationReference.where(technician_user_id: @user.id).includes(:reviewed_by_user).order(:created_at).to_a
      badges = VerificationBadge.where(user_id: @user.id).to_a

      checklist = [
        background_row(checks, identity, verification, badges),
        references_row(references, identity, verification, badges),
        trade_license_row(documents, identity, inventory, verification),
        identity_row(documents, identity, verification),
        insurance_row(documents, identity, verification),
        contact_row(verification)
      ]

      {
        technician: identity,
        checklist: checklist,
        summary: {
          verified_count: checklist.count { |row| row[:status] == "verified" },
          total: checklist.size,
          needs_review_count: checklist.count { |row| row[:status] == "needs_review" },
          background_verified: @profile.background_verified == true,
          verification_profile: verification && {
            identity_status: verification.identity_status,
            background_status: verification.background_status,
            references_status: verification.references_status,
            licenses_status: verification.licenses_status,
            insurance_status: verification.insurance_status,
            overall_completion_percentage: verification.overall_completion_percentage,
            last_verified_at: verification.last_verified_at&.iso8601
          },
          inventory_pending: inventory&.dig(:pending),
          inventory_missing: inventory&.dig(:missing) || []
        },
        items: {
          background_checks: checks.map { |c| ItemSerializer.background_check(c, identity: identity) },
          documents: documents.map { |d| ItemSerializer.document(d, identity: identity) },
          references: references.map { |r| ItemSerializer.reference(r, identity: identity) }
        },
        badges: badges.map { |b| { badge_type: b.badge_type, status: b.status, earned_at: b.earned_at&.iso8601, expires_at: b.expires_at&.iso8601 } }
      }
    end

    private

    def background_row(checks, identity, verification, badges)
      latest = checks.first
      badge = badges.find { |b| b.badge_type == "background_verified" }
      recorded = verification&.background_status
      if latest.nil?
        return row("background_check", "Background check", "not_started", "Not started",
                   detail: "No Checkr background check has been initiated for this technician.",
                   next_action: "Technician must start the background check from their profile.", recorded_status: recorded)
      end

      display = BackgroundCheckPolicy.display_status(latest)
      status =
        if latest.eligible_for_background_gate?
          "verified"
        elsif BackgroundCheckPolicy.needs_review?(latest)
          "needs_review"
        elsif latest.admin_override_status_manually_rejected? || BackgroundCheckPolicy.phase(latest).in?(BackgroundCheckPolicy::ADVERSE_PHASES)
          "rejected"
        elsif BackgroundCheckPolicy.in_progress?(latest) || BackgroundCheckPolicy.phase(latest) == "report_suspended"
          "pending"
        elsif BackgroundCheckPolicy.phase(latest) == "expired" || latest.expired?
          "expired"
        else
          "incomplete"
        end

      row("background_check", "Background check", status, display[:label],
          detail: BackgroundCheckPolicy.action_reason(latest) || "Provider: #{BackgroundCheckPolicy.presentation(latest)[:label]}.",
          updated_at: latest.updated_at, reviewer: nil,
          next_action: status == "needs_review" ? "Reviewer adjudication required." : nil,
          item_ref: ItemSerializer.item_key("background_check", latest.id),
          recorded_status: recorded,
          extra: {
            provider_result: BackgroundCheckPolicy.presentation(latest)[:label],
            override: latest.admin_override_status.to_s == "none" ? nil : latest.admin_override_status,
            badge_status: badge&.status,
            expires_at: latest.expires_at&.iso8601,
            profile_flag_background_verified: identity[:background_verified]
          })
    end

    def references_row(references, identity, verification, badges)
      approved = references.count(&:approved?)
      responded = references.count(&:responded?)
      requested = references.count(&:requested?)
      badge = badges.find { |b| b.badge_type == "references_verified" }
      status =
        if approved >= REFERENCES_REQUIRED_FOR_BADGE then "verified"
        elsif responded.positive? then "needs_review"
        elsif references.any? then "pending"
        else "not_started"
        end
      label = {
        "verified" => "#{approved} verified",
        "needs_review" => "#{responded} awaiting review",
        "pending" => "#{requested} awaiting response",
        "not_started" => "No references"
      }[status]
      reviewed = references.select(&:reviewed_at).max_by(&:reviewed_at)
      open_target = references.find(&:responded?) || references.find(&:requested?) || references.first
      next_action =
        case status
        when "needs_review" then "Review the responded reference(s)."
        when "pending" then "Open a reference to log a phone/email contact attempt or add an internal note after outreach."
        when "verified" then nil
        else "Waiting on the technician to add references."
        end
      row("references", "Professional references", status, label,
          detail: "#{references.size} submitted · #{approved} verified · #{REFERENCES_REQUIRED_FOR_BADGE} verified required for the references badge · #{TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT} required for a complete profile.",
          updated_at: references.map(&:updated_at).compact.max,
          reviewer: ItemSerializer.user_summary(reviewed&.reviewed_by_user),
          next_action: next_action,
          item_ref: open_target && ItemSerializer.item_key("reference", open_target.id),
          references: references.map { |r| ItemSerializer.reference(r, identity: identity) },
          recorded_status: verification&.references_status,
          extra: { badge_status: badge&.status, counts: { approved: approved, responded: responded, requested: requested, rejected: references.count(&:rejected?) } })
    end

    def trade_license_row(documents, identity, inventory, verification)
      docs = documents.select { |d| DocumentPolicy.category(d) == "credential" }
      inventory_trade = inventory&.dig(:trade_license) || {}
      status = document_group_status(docs, claimed: @profile.has_trade_credential, inventory_state: inventory_trade[:state])
      row("trade_license", "Trade licenses & certifications", status[:key], status[:label],
          detail: status[:detail],
          updated_at: docs.map(&:updated_at).compact.max,
          reviewer: latest_reviewer(docs),
          next_action: status[:next_action],
          item_ref: first_item_ref(docs),
          documents: docs.map { |d| ItemSerializer.document(d, identity: identity) },
          recorded_status: verification&.licenses_status)
    end

    def identity_row(documents, identity, verification)
      docs = documents.select { |d| DocumentPolicy.category(d) == "identity" }
      status = document_group_status(docs, claimed: nil, inventory_state: nil)
      row("identity", "Identity verification", status[:key], status[:label],
          detail: docs.empty? ? "No identity document uploaded. Identity is not verified by the background check alone." : status[:detail],
          updated_at: docs.map(&:updated_at).compact.max,
          reviewer: latest_reviewer(docs),
          next_action: status[:next_action],
          item_ref: first_item_ref(docs),
          documents: docs.map { |d| ItemSerializer.document(d, identity: identity) },
          recorded_status: verification&.identity_status)
    end

    def insurance_row(documents, identity, verification)
      docs = documents.select { |d| DocumentPolicy.category(d) == "insurance" }
      status = document_group_status(docs, claimed: nil, inventory_state: nil)
      row("insurance", "Insurance", status[:key], status[:label],
          detail: docs.empty? ? "No insurance certificate uploaded (optional unless required by a job)." : status[:detail],
          updated_at: docs.map(&:updated_at).compact.max,
          reviewer: latest_reviewer(docs),
          next_action: status[:next_action],
          item_ref: first_item_ref(docs),
          documents: docs.map { |d| ItemSerializer.document(d, identity: identity) },
          recorded_status: verification&.insurance_status,
          optional: true)
    end

    def contact_row(verification)
      email_ok = verification ? verification.email_verified : @user.email.present?
      phone_ok = verification ? verification.phone_verified : @user.phone.present?
      status = email_ok && phone_ok ? "verified" : (email_ok || phone_ok ? "pending" : "not_started")
      row("contact", "Contact information", status, status == "verified" ? "Email & phone on file" : "Incomplete",
          detail: "Email #{email_ok ? 'on file' : 'missing'} · Phone #{phone_ok ? 'on file' : 'missing'}.",
          updated_at: verification&.updated_at || @user.updated_at,
          next_action: status == "verified" ? nil : "Technician must add the missing contact method.",
          recorded_status: nil)
    end

    def document_group_status(docs, claimed:, inventory_state:)
      approved = docs.select { |d| DocumentPolicy.effective_status(d) == "approved" }
      pending = docs.select(&:pending_review?)
      expired = docs.select { |d| DocumentPolicy.effective_status(d) == "expired" }
      rejected = docs.select(&:rejected?)

      if approved.any?
        expiring = approved.select { |d| DocumentPolicy.expiring_soon?(d) }
        { key: "verified", label: "#{approved.size} approved#{expiring.any? ? " · #{expiring.size} expiring soon" : ''}",
          detail: "#{approved.size} approved by a reviewer#{pending.any? ? ", #{pending.size} awaiting review" : ''}#{expired.any? ? ", #{expired.size} expired" : ''}. Reviewer approval does not confirm the credential with the issuing authority.",
          next_action: pending.any? ? "Review newly uploaded document(s)." : (expiring.any? ? "Ask the technician for a renewed credential before expiry." : nil) }
      elsif pending.any?
        { key: "needs_review", label: "#{pending.size} awaiting review", detail: "Uploaded by the technician; awaiting reviewer decision.", next_action: "Review the pending document(s)." }
      elsif expired.any?
        { key: "expired", label: "Expired", detail: "Previously approved credential has expired.", next_action: "Request a renewed credential." }
      elsif rejected.any?
        { key: "rejected", label: "Rejected", detail: "Most recent upload was rejected: #{rejected.first.rejection_reason.presence || 'no reason recorded'}.", next_action: "Technician must upload a corrected document." }
      elsif claimed == false || inventory_state == "na"
        { key: "not_applicable", label: "Not applicable", detail: "Technician indicated they do not hold a trade credential.", next_action: nil }
      elsif claimed == true || inventory_state == "no"
        { key: "incomplete", label: "Claimed, no document", detail: "Technician reports holding a credential but no document has been uploaded.", next_action: "Request the credential document." }
      else
        { key: "not_started", label: "Not submitted", detail: "Nothing uploaded yet.", next_action: nil }
      end
    end

    def latest_reviewer(docs)
      reviewed = docs.select(&:reviewed_at).max_by(&:reviewed_at)
      ItemSerializer.user_summary(reviewed&.reviewed_by_user)
    end

    def first_item_ref(docs)
      target = docs.find(&:pending_review?) || docs.first
      target && ItemSerializer.item_key("document", target.id)
    end

    def row(key, label, status, status_label, detail:, recorded_status:, updated_at: nil, reviewer: nil, next_action: nil, item_ref: nil, documents: [], references: [], extra: {}, optional: false)
      {
        key: key,
        label: label,
        status: status,
        status_label: status_label,
        tone: tone_for(status),
        detail: detail,
        updated_at: updated_at&.iso8601,
        reviewer: reviewer,
        next_action: next_action,
        item_ref: item_ref,
        documents: documents,
        references: references,
        recorded_status: recorded_status,
        optional: optional
      }.merge(extra)
    end

    def tone_for(status)
      case status
      when "verified" then "success"
      when "needs_review" then "orange"
      when "pending" then "info"
      when "rejected" then "danger"
      when "expired", "incomplete" then "warning"
      else "neutral"
      end
    end
  end
end
