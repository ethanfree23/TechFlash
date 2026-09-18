# frozen_string_literal: true

# Immutable record of a company-initiated early end to a claimed assignment.
#
# The job row carries only `terminated_at` (so lifecycle scopes stay cheap); everything
# needed to reconstruct what was agreed, when it ended, why, who ended it, how much was
# worked, what was paid, and what was refunded lives here.
class JobTermination < ApplicationRecord
  belongs_to :job
  belongs_to :job_application, optional: true
  belongs_to :technician_profile, optional: true
  belongs_to :initiated_by_user, class_name: "User"

  enum :initiated_by_role, { company: 0, admin: 1 }, prefix: :initiated_by

  # Reasons are for records, reviews, analytics and future trust/safety work.
  # They never carry an automatic payment consequence.
  enum :reason, {
    technician_performance: 0,
    technician_reliability: 1,
    skill_mismatch: 2,
    safety_concern: 3,
    conduct_professionalism: 4,
    project_completed_early: 5,
    project_canceled: 6,
    company_schedule_changed: 7,
    staffing_need_changed: 8,
    other: 9
  }, prefix: :reason

  REASON_LABELS = {
    "technician_performance" => "Technician performance",
    "technician_reliability" => "Technician reliability / attendance",
    "skill_mismatch" => "Skill mismatch",
    "safety_concern" => "Safety concern",
    "conduct_professionalism" => "Conduct / professionalism",
    "project_completed_early" => "Project completed early",
    "project_canceled" => "Project canceled",
    "company_schedule_changed" => "Company schedule changed",
    "staffing_need_changed" => "Staffing need changed",
    "other" => "Other"
  }.freeze

  validates :terminated_at, :effective_end_at, presence: true
  validates :notes, presence: { message: "are required when the reason is Other." }, if: :reason_other?
  validate :notes_length

  scope :work_performed, -> { where(work_performed: true) }

  def reason_label
    REASON_LABELS[reason.to_s] || reason.to_s.humanize
  end

  def pay_basis_guaranteed_job_pay?
    pay_basis.to_i == Job.pay_bases["guaranteed_job_pay"]
  end

  def pay_basis_key
    Job.pay_bases.key(pay_basis.to_i) || "actual_hours_worked"
  end

  private

  def notes_length
    return if notes.blank?

    errors.add(:notes, "must be 2000 characters or fewer.") if notes.to_s.length > 2_000
  end
end
