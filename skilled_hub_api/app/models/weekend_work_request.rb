# frozen_string_literal: true

class WeekendWorkRequest < ApplicationRecord
  belongs_to :job
  belongs_to :technician_profile
  belongs_to :requested_by_user, class_name: "User"

  enum status: {
    not_requested: 0,
    requested_by_company: 1,
    accepted_by_technician: 2,
    declined_by_technician: 3,
    cancelled: 4,
    completed: 5
  }, _scopes: false

  validates :requested_date, :requested_start_at, :requested_end_at, :estimated_hours, presence: true
  validates :estimated_hours, numericality: { greater_than: 0 }
  validates :applicable_multiplier, numericality: { greater_than_or_equal_to: 1.0, less_than_or_equal_to: 3.0 }
  validate :end_after_start

  private

  def end_after_start
    return if requested_start_at.blank? || requested_end_at.blank?
    return if requested_end_at > requested_start_at

    errors.add(:requested_end_at, "must be after start time.")
  end
end
