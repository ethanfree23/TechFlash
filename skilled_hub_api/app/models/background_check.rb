class BackgroundCheck < ApplicationRecord
  belongs_to :user
  belongs_to :job, optional: true
  belongs_to :job_application, optional: true
  belongs_to :company_profile, optional: true

  NORMALIZED_STATUSES = %w[
    pending
    invitation_sent
    invitation_completed
    invitation_expired
    invitation_deleted
    report_pending
    report_suspended
    report_resumed
    report_complete
    complete_with_canceled_screenings
    report_disputed
    report_canceled
    report_engaged
    report_pre_adverse_action
    report_post_adverse_action
    adverse_action_notice_not_delivered
    review_required
    clear
    consider
    canceled
    not_started
  ].freeze

  enum :status, {
    not_started: 0,
    invited: 1,
    pending: 2,
    processing: 3,
    clear: 4,
    consider: 5,
    suspended: 6,
    expired: 7,
    failed: 8,
    manually_approved: 9,
    manually_rejected: 10
  }, default: :not_started

  enum :payment_status, {
    not_required: 0,
    pending: 1,
    paid: 2,
    waived: 3,
    failed: 4
  }, default: :not_required, prefix: true

  enum :admin_override_status, {
    none: 0,
    manually_approved: 1,
    manually_rejected: 2
  }, default: :none, prefix: true

  validates :provider, presence: true
  validates :paid_by, inclusion: { in: %w[technician premium admin company] }
  validates :normalized_status, inclusion: { in: NORMALIZED_STATUSES }, allow_blank: true

  scope :active_or_processing, -> { where(status: %i[invited pending processing]) }
  scope :eligible_clear, -> { where(status: %i[clear manually_approved]) }

  def eligible_for_background_gate?
    return false if provider_includes_canceled?
    return false if provider_assess_status.to_s.downcase.in?(%w[review escalated consider])

    clear? || manually_approved?
  end

  def normalized_status_value
    normalized_status.presence || legacy_status_to_normalized
  end

  def monitoring_status
    {
      normalized_status: normalized_status_value,
      provider_status: provider_status,
      provider_assess_status: provider_assess_status,
      provider_adjudication: provider_adjudication,
      provider_includes_canceled: provider_includes_canceled,
      provider_updated_at: provider_updated_at,
      result: result,
      report_eta_at: report_eta_at
    }
  end

  def terminal_normalized_status?
    normalized_status_value.in?(%w[
      clear
      complete_with_canceled_screenings
      consider
      report_complete
      report_canceled
      canceled
      report_post_adverse_action
      adverse_action_notice_not_delivered
    ])
  end

  def technician_visible_status_label
    case normalized_status_value
    when "clear" then "Verified"
    when "complete_with_canceled_screenings" then "Completed with canceled screenings"
    when "consider", "review_required", "report_disputed" then "Review required"
    when "report_pre_adverse_action" then "Pre-adverse action in progress"
    when "report_post_adverse_action" then "Post-adverse action sent"
    when "report_canceled", "canceled", "invitation_expired", "invitation_deleted" then "Canceled"
    when "report_suspended" then "Action required"
    when "report_resumed" then "Resumed"
    when "invitation_sent" then "Invitation sent"
    when "invitation_completed" then "Invitation completed"
    else
      "In progress"
    end
  end

  def admin_visible_status_label
    case normalized_status_value
    when "clear" then "Clear"
    when "complete_with_canceled_screenings" then "Complete with canceled screenings"
    when "consider", "review_required" then "Consider / review required"
    when "report_disputed" then "Disputed"
    when "report_pre_adverse_action" then "Pre-adverse action"
    when "report_post_adverse_action" then "Post-adverse action"
    when "adverse_action_notice_not_delivered" then "Adverse notice not delivered"
    when "report_canceled", "canceled", "invitation_expired", "invitation_deleted" then "Canceled"
    else
      normalized_status_value.to_s.humanize
    end
  end

  private

  def legacy_status_to_normalized
    return "not_started" if not_started?
    return "invitation_sent" if invited?
    return "report_pending" if pending? || processing?
    return "report_suspended" if suspended?
    return "clear" if clear? || manually_approved?
    return "consider" if consider?

    "canceled"
  end
end
