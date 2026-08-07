class CheckrReconciliationService
  DEFAULT_STALE_HOURS = 6
  DEFAULT_LIMIT = 200

  def initialize(stale_hours: nil, limit: nil, logger: Rails.logger)
    @stale_hours = (stale_hours || ENV.fetch("CHECKR_RECONCILE_STALE_HOURS", DEFAULT_STALE_HOURS)).to_i
    @limit = (limit || ENV.fetch("CHECKR_RECONCILE_LIMIT", DEFAULT_LIMIT)).to_i
    @logger = logger
    @client = CheckrClient.new
  end

  def run
    return { skipped: true, reason: "checkr_not_configured", processed: 0, reconciled: 0 } unless @client.configured?

    processed = 0
    reconciled = 0
    stale_checks.find_each do |check|
      processed += 1
      begin
        reconciled += 1 if reconcile_check(check)
      rescue StandardError => e
        @logger.warn("[checkr_reconcile] background_check_id=#{check.id} failed #{e.class}: #{e.message}")
      end
    end

    { skipped: false, processed: processed, reconciled: reconciled }
  end

  private

  def stale_checks
    scope = BackgroundCheck.where(provider: "checkr")
      .where(normalized_status: %w[pending invitation_sent invitation_completed report_pending report_suspended report_resumed report_disputed])
      .where("updated_at <= ?", @stale_hours.hours.ago)
      .where("provider_report_id IS NOT NULL OR provider_invitation_id IS NOT NULL")
      .limit(@limit)

    scope
  end

  def reconcile_check(check)
    report = fetch_report_for(check)
    invitation = fetch_invitation_for(check)
    object = report || invitation
    return false if object.blank?

    event_type = inferred_event_type(object: object)
    attrs = build_attrs(check: check, event_type: event_type, object: object)
    return false if attrs.blank?

    check.update!(attrs)
    CheckrWebhookMetrics.increment("stale_check_reconciled", tags: { background_check_id: check.id, event_type: event_type, normalized_status: attrs[:normalized_status] })
    true
  end

  def fetch_report_for(check)
    return nil if check.provider_report_id.blank?

    @client.get_report(report_id: check.provider_report_id)
  rescue CheckrClient::Error
    nil
  end

  def fetch_invitation_for(check)
    return nil if check.provider_invitation_id.blank?

    @client.get_invitation(invitation_id: check.provider_invitation_id)
  rescue CheckrClient::Error
    nil
  end

  def inferred_event_type(object:)
    type = object["object"].to_s
    if type == "report"
      status = object["status"].to_s
      result = object["result"].to_s
      return "report.completed" if status == "complete" || result.in?(%w[clear consider])
      return "report.suspended" if status == "suspended"
      return "report.canceled" if status.in?(%w[canceled cancelled expired withdrawn])
      "report.updated"
    elsif type == "invitation"
      "invitation.updated"
    else
      "checkr.object.updated"
    end
  end

  def build_attrs(check:, event_type:, object:)
    mapping = CheckrLifecycleMapper.resolve(event_type: event_type, object: object)
    normalized = mapping[:normalized_status].to_s
    return nil if normalized.blank?

    provider_updated_at = parse_provider_updated_at(object)
    return nil if provider_updated_at.present? && check.provider_updated_at.present? && provider_updated_at < check.provider_updated_at

    includes_canceled = ActiveModel::Type::Boolean.new.cast(object["includes_canceled"]) || false
    assess_status = object["assessment"] || object["assessment_status"] || object["assess_status"] || Array(object["assessments"]).last&.dig("status")

    attrs = {
      status: normalize_to_legacy_status(normalized),
      normalized_status: normalized,
      provider_status: object["status"].presence || check.provider_status,
      result: object["result"].presence || check.result,
      provider_assess_status: assess_status.presence || check.provider_assess_status,
      provider_adjudication: object["adjudication"].presence || check.provider_adjudication,
      provider_includes_canceled: includes_canceled,
      provider_updated_at: provider_updated_at || check.provider_updated_at,
      provider_object_type: object["object"].to_s.presence || check.provider_object_type,
      report_url: object["report_url"].presence || object["uri"].presence || check.report_url,
      dashboard_url: object["dashboard_url"].presence || check.dashboard_url,
      report_eta_at: parse_eta(object["eta"] || object["estimated_completion_time"]) || check.report_eta_at
    }
    attrs[:completed_at] = Time.current if mapping[:terminal]
    attrs
  end

  def normalize_to_legacy_status(normalized_status)
    case normalized_status.to_s
    when "invitation_sent" then :invited
    when "invitation_completed", "report_pending", "report_resumed", "pending" then :pending
    when "report_suspended" then :suspended
    when "clear" then :clear
    when "consider", "review_required", "report_disputed" then :consider
    when "report_canceled", "invitation_expired", "invitation_deleted", "canceled" then :failed
    else
      :processing
    end
  end

  def parse_provider_updated_at(object)
    raw = object["updated_at"] || object["completed_at"] || object["created_at"]
    return nil if raw.blank?

    Time.zone.parse(raw.to_s)
  rescue StandardError
    nil
  end

  def parse_eta(raw_eta)
    return nil if raw_eta.blank?

    Time.zone.parse(raw_eta.to_s)
  rescue StandardError
    nil
  end
end
