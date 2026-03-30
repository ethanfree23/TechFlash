class Conversation < ApplicationRecord
  TYPE_JOB = "job".freeze
  TYPE_FEEDBACK = "feedback".freeze

  has_many :messages, dependent: :destroy
  belongs_to :job, optional: true
  belongs_to :technician_profile, optional: true
  belongs_to :company_profile, optional: true
  belongs_to :feedback_submission, optional: true

  scope :job_threads, -> { where(conversation_type: [TYPE_JOB, nil]) }
  scope :feedback_threads, -> { where(conversation_type: TYPE_FEEDBACK) }

  validate :conversation_associations_match_type

  def feedback?
    conversation_type == TYPE_FEEDBACK
  end

  def job_thread?
    conversation_type.blank? || conversation_type == TYPE_JOB
  end

  private

  def conversation_associations_match_type
    if feedback?
      errors.add(:feedback_submission_id, "can't be blank") if feedback_submission_id.blank?
      # Submitter may be admin (no tech/company profile); message uses User as sender.
    else
      errors.add(:job_id, "can't be blank") if job_id.blank?
      errors.add(:technician_profile_id, "can't be blank") if technician_profile_id.blank?
      errors.add(:company_profile_id, "can't be blank") if company_profile_id.blank?
    end
  end
end
