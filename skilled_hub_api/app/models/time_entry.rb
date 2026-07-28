# frozen_string_literal: true

class TimeEntry < ApplicationRecord
  belongs_to :job
  belongs_to :technician_profile
  belongs_to :weekend_work_request, optional: true
  belongs_to :submitted_by_user, class_name: "User"
  belongs_to :approved_by_user, class_name: "User", optional: true
  belongs_to :override_by_user, class_name: "User", optional: true

  has_one :time_entry_pay_line, dependent: :destroy

  enum status: {
    submitted: 0,
    approved: 1,
    rejected: 2,
    paid: 3
  }, _scopes: false

  validates :worked_start_at, :worked_end_at, :worked_on_date, :worked_hours, :job_timezone, presence: true
  validates :worked_hours, numericality: { greater_than: 0 }
  validate :end_after_start

  private

  def end_after_start
    return if worked_start_at.blank? || worked_end_at.blank?
    return if worked_end_at > worked_start_at

    errors.add(:worked_end_at, "must be after start time.")
  end
end
