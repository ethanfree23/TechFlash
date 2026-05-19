# frozen_string_literal: true

class Conversation < ApplicationRecord
  TYPE_JOB = "job".freeze
  TYPE_FEEDBACK = "feedback".freeze

  INBOX_STATUSES = %w[open pending resolved archived].freeze
  PRIORITIES = %w[urgent high normal low].freeze

  has_many :messages, dependent: :destroy
  belongs_to :job, optional: true
  belongs_to :technician_profile, optional: true
  belongs_to :company_profile, optional: true
  belongs_to :feedback_submission, optional: true
  belongs_to :assigned_to, class_name: "User", optional: true

  scope :job_threads, -> { where(conversation_type: [TYPE_JOB, nil]) }
  scope :feedback_threads, -> { where(conversation_type: TYPE_FEEDBACK) }
  scope :inbox_unread_for_admin, -> { feedback_threads.where(admin_read_at: nil) }

  validates :inbox_status, inclusion: { in: INBOX_STATUSES }, allow_nil: false
  validates :priority, inclusion: { in: PRIORITIES }, allow_nil: false

  validate :conversation_associations_match_type

  def feedback?
    conversation_type == TYPE_FEEDBACK
  end

  def job_thread?
    conversation_type.blank? || conversation_type == TYPE_JOB
  end

  def unread_for_admin?
    feedback? && admin_read_at.blank?
  end

  def mark_read_for_admin!
    update!(admin_read_at: Time.current) if admin_read_at.blank?
  end

  private

  def conversation_associations_match_type
    if feedback?
      errors.add(:feedback_submission_id, "can't be blank") if feedback_submission_id.blank?
    else
      errors.add(:job_id, "can't be blank") if job_id.blank?
      errors.add(:technician_profile_id, "can't be blank") if technician_profile_id.blank?
      errors.add(:company_profile_id, "can't be blank") if company_profile_id.blank?
    end
  end
end
