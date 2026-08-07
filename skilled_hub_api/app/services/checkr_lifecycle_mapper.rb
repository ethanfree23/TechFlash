class CheckrLifecycleMapper
  EVENT_MAPPINGS = [
    { event_type: "invitation.created", normalized_status: "invitation_sent", terminal: false, technician_label: "Invitation sent", admin_label: "Invitation created" },
    { event_type: "invitation.completed", normalized_status: "invitation_completed", terminal: false, technician_label: "Invitation completed", admin_label: "Invitation completed" },
    { event_type: "invitation.expired", normalized_status: "invitation_expired", terminal: true, technician_label: "Invitation expired", admin_label: "Invitation expired" },
    { event_type: "invitation.deleted", normalized_status: "invitation_deleted", terminal: true, technician_label: "Invitation canceled", admin_label: "Invitation deleted" },
    { event_type: "invitation.canceled", normalized_status: "invitation_deleted", terminal: true, technician_label: "Invitation canceled", admin_label: "Invitation canceled" },
    { event_type: "report.suspended", normalized_status: "report_suspended", terminal: false, technician_label: "Action required", admin_label: "Report suspended" },
    { event_type: "report.resumed", normalized_status: "report_resumed", terminal: false, technician_label: "Resumed", admin_label: "Report resumed" },
    { event_type: "report.updated", normalized_status: "report_pending", terminal: false, technician_label: "In progress", admin_label: "Report updated" },
    { event_type: "report.upgraded", normalized_status: "report_pending", terminal: false, technician_label: "In progress", admin_label: "Report upgraded" },
    { event_type: "report.paused", normalized_status: "report_suspended", terminal: false, technician_label: "Action required", admin_label: "Report paused" },
    { event_type: "report.disputed", normalized_status: "report_disputed", terminal: false, technician_label: "Review required", admin_label: "Report disputed" },
    { event_type: "report.dispute_completed", normalized_status: "report_disputed", terminal: false, technician_label: "Review required", admin_label: "Dispute completed" },
    { event_type: "report.canceled", normalized_status: "report_canceled", terminal: true, technician_label: "Canceled", admin_label: "Report canceled" },
    { event_type: "report.pre_adverse_action", normalized_status: "report_pre_adverse_action", terminal: false, technician_label: "Pre-adverse action in progress", admin_label: "Pre-adverse action" },
    { event_type: "report.post_adverse_action", normalized_status: "report_post_adverse_action", terminal: true, technician_label: "Post-adverse action sent", admin_label: "Post-adverse action" },
    { event_type: "report.engaged", normalized_status: "report_engaged", terminal: false, technician_label: "Engaged", admin_label: "Report engaged" },
    { event_type: "adverse_action.notice_not_delivered", normalized_status: "adverse_action_notice_not_delivered", terminal: true, technician_label: "Review required", admin_label: "Adverse notice not delivered" },
    { event_type: "adverse_action.created", normalized_status: "report_pre_adverse_action", terminal: false, technician_label: "Pre-adverse action in progress", admin_label: "Adverse action created" },
    { event_type: "adverse_action.completed", normalized_status: "report_post_adverse_action", terminal: true, technician_label: "Post-adverse action sent", admin_label: "Adverse action completed" }
  ].freeze

  def self.mapping_rows
    EVENT_MAPPINGS
  end

  def self.resolve(event_type:, object:)
    includes_canceled = ActiveModel::Type::Boolean.new.cast(object["includes_canceled"])
    result = object["result"].to_s.downcase.presence
    provider_status = object["status"].to_s.downcase.presence
    assessment = extract_assessment(object).to_s.downcase.presence

    if event_type.to_s == "report.completed"
      return completed_mapping(result: result, includes_canceled: includes_canceled, assessment: assessment)
    end

    if event_type.to_s.start_with?("report.") && assessment.in?(%w[review escalated])
      return {
        normalized_status: "review_required",
        terminal: false,
        technician_label: "Review required",
        admin_label: "Assess review required"
      }
    end

    mapped = EVENT_MAPPINGS.find { |row| row[:event_type] == event_type.to_s }
    if mapped.present?
      return mapped.slice(:normalized_status, :terminal, :technician_label, :admin_label)
    end

    fallback_from_provider_status(provider_status, result, includes_canceled)
  end

  def self.completed_mapping(result:, includes_canceled:, assessment:)
    if result == "clear" && includes_canceled
      return {
        normalized_status: "complete_with_canceled_screenings",
        terminal: true,
        technician_label: "Completed with canceled screenings",
        admin_label: "Complete with canceled screenings"
      }
    end

    if assessment.in?(%w[review escalated]) || result == "consider"
      return {
        normalized_status: "consider",
        terminal: true,
        technician_label: "Review required",
        admin_label: "Consider / review required"
      }
    end

    return { normalized_status: "clear", terminal: true, technician_label: "Verified", admin_label: "Clear" } if result == "clear"

    {
      normalized_status: "report_complete",
      terminal: true,
      technician_label: "Report complete",
      admin_label: "Report complete"
    }
  end
  private_class_method :completed_mapping

  def self.fallback_from_provider_status(provider_status, result, includes_canceled)
    if provider_status.in?(%w[pending processing in_progress])
      return { normalized_status: "report_pending", terminal: false, technician_label: "In progress", admin_label: "Pending" }
    end
    if provider_status == "suspended"
      return { normalized_status: "report_suspended", terminal: false, technician_label: "Action required", admin_label: "Suspended" }
    end
    if provider_status.in?(%w[canceled cancelled expired withdrawn])
      return { normalized_status: "report_canceled", terminal: true, technician_label: "Canceled", admin_label: "Canceled" }
    end
    if provider_status == "complete" && result == "clear" && includes_canceled
      return { normalized_status: "complete_with_canceled_screenings", terminal: true, technician_label: "Completed with canceled screenings", admin_label: "Complete with canceled screenings" }
    end
    if provider_status == "complete" && result == "consider"
      return { normalized_status: "consider", terminal: true, technician_label: "Review required", admin_label: "Consider" }
    end

    { normalized_status: "pending", terminal: false, technician_label: "In progress", admin_label: "Pending" }
  end
  private_class_method :fallback_from_provider_status

  def self.extract_assessment(object)
    object["assessment"] || object["assessment_status"] || object["assess_status"] ||
      Array(object["assessments"]).last&.dig("status")
  end
  private_class_method :extract_assessment
end
