# frozen_string_literal: true

module TrustSafety
  # Single source of truth for how an admin may act on a Checkr background check.
  #
  # Separates four distinct concepts that the old dashboard conflated:
  #   * provider phase        — what Checkr says (normalized_status / result / assessment)
  #   * reviewer decision     — admin_override_status (manual approve / reject)
  #   * eligibility           — BackgroundCheck#eligible_for_background_gate? (final gate)
  #   * allowed actions       — what the admin may do *right now*
  #
  # Safety rules enforced here (and re-checked server-side on write):
  #   * not_started / invitation / processing checks have NO approve action.
  #   * consider / disputed / suspended / incomplete reports never auto-clear; the only
  #     path to eligibility is an explicit manual override with reason + confirmation.
  #   * disputed, pre-adverse and suspended reports are read-only while Checkr's lawful
  #     process runs. Adverse action is never initiated from this UI.
  module BackgroundCheckPolicy
    module_function

    # Provider phases where a completed report exists and an adjudication decision is
    # a legitimate admin responsibility.
    REVIEWABLE_PHASES = %w[consider review_required report_complete complete_with_canceled_screenings].freeze

    # Phases surfaced in the "Needs Review" queue (admin attention required).
    NEEDS_REVIEW_PHASES = (REVIEWABLE_PHASES + %w[report_disputed report_pre_adverse_action adverse_action_notice_not_delivered]).freeze

    IN_PROGRESS_PHASES = %w[invitation_sent invitation_completed report_pending report_resumed report_engaged pending processing].freeze
    SUSPENDED_PHASES = %w[report_suspended].freeze
    CANCELED_PHASES = %w[canceled report_canceled invitation_deleted].freeze
    EXPIRED_PHASES = %w[invitation_expired expired].freeze
    ADVERSE_PHASES = %w[report_post_adverse_action].freeze

    # Legacy enum statuses that map onto each phase group when normalized_status is blank
    # on old rows (BackgroundCheck#legacy_status_to_normalized covers the mapping).
    LEGACY_IN_PROGRESS = %w[invited pending processing].freeze
    LEGACY_NEEDS_REVIEW = %w[consider].freeze
    LEGACY_FLAGGED = %w[consider suspended failed].freeze

    PHASE_PRESENTATION = {
      "not_started" => { label: "Not Started", tone: "neutral", group: "not_started" },
      "invitation_sent" => { label: "Invitation Sent", tone: "info", group: "in_progress" },
      "invitation_completed" => { label: "Candidate Submitted", tone: "info", group: "in_progress" },
      "report_pending" => { label: "Processing", tone: "info", group: "in_progress" },
      "pending" => { label: "Processing", tone: "info", group: "in_progress" },
      "processing" => { label: "Processing", tone: "info", group: "in_progress" },
      "report_resumed" => { label: "Processing (Resumed)", tone: "info", group: "in_progress" },
      "report_engaged" => { label: "Processing", tone: "info", group: "in_progress" },
      "report_suspended" => { label: "Suspended — Candidate Action", tone: "warning", group: "suspended" },
      "clear" => { label: "Completed — Clear", tone: "success", group: "clear" },
      "consider" => { label: "Needs Review", tone: "orange", group: "needs_review" },
      "review_required" => { label: "Needs Review", tone: "orange", group: "needs_review" },
      "report_complete" => { label: "Completed — Needs Review", tone: "orange", group: "needs_review" },
      "complete_with_canceled_screenings" => { label: "Complete (Canceled Screenings)", tone: "orange", group: "needs_review" },
      "report_disputed" => { label: "Disputed", tone: "warning", group: "needs_review" },
      "report_pre_adverse_action" => { label: "Pre-Adverse Action", tone: "danger", group: "needs_review" },
      "adverse_action_notice_not_delivered" => { label: "Adverse Notice Undelivered", tone: "danger", group: "needs_review" },
      "report_post_adverse_action" => { label: "Adverse Action Complete", tone: "danger", group: "adverse" },
      "invitation_expired" => { label: "Expired", tone: "neutral", group: "expired" },
      "expired" => { label: "Expired", tone: "neutral", group: "expired" },
      "invitation_deleted" => { label: "Canceled", tone: "neutral", group: "canceled" },
      "report_canceled" => { label: "Canceled", tone: "neutral", group: "canceled" },
      "canceled" => { label: "Canceled", tone: "neutral", group: "canceled" }
    }.freeze

    def phase(check)
      value = check.normalized_status_value.to_s
      value = "expired" if check.expired?
      value = "not_started" if value.blank?
      value
    end

    def error?(check)
      check.failed?
    end

    def presentation(check)
      if error?(check)
        return { key: "error", label: "Error", tone: "danger", group: "error", detail: error_detail(check) }
      end

      key = phase(check)
      base = PHASE_PRESENTATION[key] || { label: key.humanize, tone: "info", group: "in_progress" }
      base.merge(key: key, detail: nil)
    end

    # The reviewer-facing headline status. Manual overrides take precedence so the queue
    # never shows a "Needs Review" badge for something an admin already decided.
    def display_status(check)
      provider = presentation(check)
      case check.admin_override_status.to_s
      when "manually_approved"
        { key: "manually_approved", label: "Manually Approved", tone: "success", group: "clear", provider_label: provider[:label] }
      when "manually_rejected"
        { key: "manually_rejected", label: "Manually Rejected", tone: "danger", group: "rejected", provider_label: provider[:label] }
      else
        provider.merge(provider_label: provider[:label])
      end
    end

    def error_detail(check)
      notes = check.admin_notes.to_s
      return "Checkr invitation outcome unknown — reconcile before acting." if notes.start_with?("INVITATION_OUTCOME_UNKNOWN:")

      "Processing error recorded on this check."
    end

    def needs_review?(check)
      return false if check.admin_override_status_manually_approved? || check.admin_override_status_manually_rejected?
      return true if error?(check)

      NEEDS_REVIEW_PHASES.include?(phase(check))
    end

    def flagged?(check)
      needs_review?(check) || SUSPENDED_PHASES.include?(phase(check))
    end

    def in_progress?(check)
      IN_PROGRESS_PHASES.include?(phase(check)) || SUSPENDED_PHASES.include?(phase(check))
    end

    def report_exists?(check)
      check.provider_report_id.present? || REVIEWABLE_PHASES.include?(phase(check)) || phase(check) == "clear"
    end

    # Overrides the current admin may apply. Empty when the report cannot be safely adjudicated.
    def allowed_overrides(check)
      return [] if error?(check)

      current = check.admin_override_status.to_s
      key = phase(check)
      list = []
      if REVIEWABLE_PHASES.include?(key)
        list << "manually_approved" unless current == "manually_approved"
        list << "manually_rejected" unless current == "manually_rejected"
      elsif key == "clear"
        list << "manually_rejected" unless current == "manually_rejected"
        list << "manually_approved" if current == "manually_rejected"
      end
      list
    end

    def override_allowed?(check, override_status)
      allowed_overrides(check).include?(override_status.to_s)
    end

    def override_block_reason(check)
      key = phase(check)
      return error_detail(check) if error?(check)
      return "No Checkr report exists yet. A background check cannot be approved before the candidate completes it." if key == "not_started" || key.start_with?("invitation")
      return "Checkr is still processing this report. Wait for the provider result before making a decision." if IN_PROGRESS_PHASES.include?(key)
      return "The report is suspended pending candidate action in Checkr. It cannot be adjudicated until Checkr resumes it." if SUSPENDED_PHASES.include?(key)
      return "The candidate has an open dispute with Checkr. Wait for the dispute to resolve before deciding." if key == "report_disputed"
      return "An adverse-action process is already running in Checkr. Manage it there; do not override here." if key == "report_pre_adverse_action" || key == "adverse_action_notice_not_delivered"
      return "Adverse action has been completed through Checkr's lawful process." if ADVERSE_PHASES.include?(key)
      return "This check was canceled or expired. The technician must start a new check." if CANCELED_PHASES.include?(key) || EXPIRED_PHASES.include?(key)

      nil
    end

    # Structured action list for the UI. The server re-validates every write against
    # +override_allowed?+, so this is a convenience, not the enforcement boundary.
    def actions(check)
      overrides = allowed_overrides(check)
      list = []
      if overrides.include?("manually_approved")
        list << {
          key: "manually_approved",
          label: check.admin_override_status_manually_rejected? ? "Reverse rejection (approve)" : "Manually approve",
          tone: "success",
          requires_reason: true,
          requires_confirmation: true,
          consequence: "Marks this technician as background-verified and activates their badge. Checkr's report result is not changed."
        }
      end
      if overrides.include?("manually_rejected")
        list << {
          key: "manually_rejected",
          label: check.admin_override_status_manually_approved? ? "Reverse approval (reject)" : "Manually reject",
          tone: "danger",
          requires_reason: true,
          requires_confirmation: true,
          consequence: "Removes background verification for this technician. Any legally required adverse-action notices must be handled through Checkr."
        }
      end
      list << { key: "note", label: "Add reviewer note", tone: "neutral", requires_reason: true, requires_confirmation: false }
      list
    end

    def action_reason(check)
      return error_detail(check) if error?(check)

      case phase(check)
      when "consider", "review_required" then "Checkr returned a result that requires human adjudication."
      when "report_complete" then "Report completed without a clear result — review the report in Checkr."
      when "complete_with_canceled_screenings" then "Report completed with canceled screenings — confirm coverage is sufficient."
      when "report_disputed" then "Candidate disputed the report; awaiting Checkr resolution."
      when "report_pre_adverse_action" then "Pre-adverse action notice in progress through Checkr."
      when "adverse_action_notice_not_delivered" then "Adverse action notice could not be delivered — follow up in Checkr."
      when "report_suspended" then "Checkr suspended the report pending candidate information."
      when "not_started" then "Technician has not started their background check."
      when "invitation_sent" then "Invitation sent; waiting for the candidate to complete it."
      when "clear" then "Report clear — no action required."
      else
        "Checkr is processing this report."
      end
    end
  end
end
