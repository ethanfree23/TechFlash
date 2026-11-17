# frozen_string_literal: true

class TechnicianFollowUp < ApplicationRecord
  STATUSES = %w[open completed canceled].freeze

  belongs_to :user
  belongs_to :assigned_admin, class_name: "User"
  belongs_to :created_by, class_name: "User"
  belongs_to :technician_interaction, optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :due_at, presence: true
  validate :user_must_be_technician
  validate :assigned_admin_must_be_admin
  validate :created_by_must_be_admin

  before_validation :normalize_fields
  after_save :sync_activation_next_follow_up
  after_destroy :sync_activation_next_follow_up

  scope :open_for, ->(user_id) { where(user_id: user_id, status: "open") }
  scope :open_status, -> { where(status: "open") }
  scope :due_today, lambda {
    now = Time.current
    open_status.where(due_at: now.beginning_of_day..now.end_of_day)
  }
  scope :overdue, -> { open_status.where("due_at < ?", Time.current) }

  def complete!(admin: nil)
    return self if status == "completed"

    update!(
      status: "completed",
      completed_at: Time.current,
      assigned_admin: admin || assigned_admin
    )
  end

  def cancel!
    return self if status == "canceled"

    update!(status: "canceled", completed_at: nil)
  end

  private

  def normalize_fields
    self.status = status.to_s.strip.presence || "open"
    self.description = description.to_s.strip.presence
  end

  def user_must_be_technician
    return if user&.technician?

    errors.add(:user, "must be a technician")
  end

  def assigned_admin_must_be_admin
    return if assigned_admin&.admin?

    errors.add(:assigned_admin, "must be an admin")
  end

  def created_by_must_be_admin
    return if created_by&.admin?

    errors.add(:created_by, "must be an admin")
  end

  def sync_activation_next_follow_up
    activation = TechnicianActivation.find_by(user_id: user_id)
    activation&.refresh_follow_up_cache!
  end
end
