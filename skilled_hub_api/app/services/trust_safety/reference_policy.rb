# frozen_string_literal: true

module TrustSafety
  # Display and permitted actions for professional references.
  module ReferencePolicy
    module_function

    CONTACT_OUTCOMES = %w[reached voicemail no_answer wrong_number declined email_bounced].freeze

    def display_status(ref)
      case ref.status.to_s
      when "requested" then { key: "requested", label: "Awaiting Response", tone: "info", group: "pending" }
      when "responded" then { key: "responded", label: "Awaiting Review", tone: "warning", group: "pending" }
      when "approved" then { key: "approved", label: "Verified", tone: "success", group: "approved" }
      when "rejected" then { key: "rejected", label: "Rejected", tone: "danger", group: "rejected" }
      else { key: ref.status.to_s, label: ref.status.to_s.humanize, tone: "neutral", group: "other" }
      end
    end

    def needs_review?(ref)
      ref.responded?
    end

    def actions(ref)
      note = { key: "note", label: "Add reviewer note", tone: "neutral", requires_reason: true, requires_confirmation: false }
      contact = { key: "contact_attempt", label: "Record contact attempt", tone: "neutral", requires_reason: false, requires_confirmation: false,
                  consequence: "Logs an outreach attempt (reached, voicemail, wrong number…) without changing the decision." }
      info = { key: "request_info", label: "Request more information", tone: "neutral", requires_reason: true, requires_confirmation: false,
               consequence: "Sends the technician an in-app request about this reference." }

      case ref.status.to_s
      when "responded"
        [
          { key: "approve", label: "Mark verified", tone: "success", requires_reason: false, requires_confirmation: true,
            consequence: "Counts toward the technician's verified references (2 verified references activate the badge)." },
          { key: "reject", label: "Reject", tone: "danger", requires_reason: true, requires_confirmation: true,
            consequence: "The reference will not count toward verification. The technician is notified." },
          info, contact, note
        ]
      when "requested"
        [
          { key: "approve", label: "Override: mark verified", tone: "success", requires_reason: true, requires_confirmation: true, override: true,
            consequence: "The reference has not responded online. Only use this when you verified the reference directly (e.g. by phone) and record how." },
          { key: "reject", label: "Reject", tone: "danger", requires_reason: true, requires_confirmation: true,
            consequence: "The reference will not count toward verification. The technician is notified." },
          info, contact, note
        ]
      else
        [
          { key: ref.approved? ? "reject" : "approve",
            label: ref.approved? ? "Override: reject" : "Override: mark verified",
            tone: ref.approved? ? "danger" : "success",
            requires_reason: true, requires_confirmation: true, override: true,
            consequence: "Reverses a previous reviewer decision. Requires a written reason and is recorded in the audit log." },
          contact, note
        ]
      end
    end

    def action_reason(ref)
      case ref.status.to_s
      when "responded" then "Reference submitted their response and is awaiting reviewer decision."
      when "requested" then "Reference request sent; no response yet."
      else nil
      end
    end
  end
end
