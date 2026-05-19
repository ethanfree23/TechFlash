class ConversationSerializer < ActiveModel::Serializer
  attributes :id, :conversation_type, :job_id, :technician_profile_id, :company_profile_id,
             :feedback_submission_id, :created_at, :updated_at,
             :inbox_status, :priority, :assigned_to_id, :admin_read_at

  attribute :feedback_kind do
    object.feedback_submission&.kind
  end

  attribute :inbox_category do
    object.feedback? ? "feedback" : "job"
  end

  attribute :submitter_email do
    object.feedback_submission&.user&.email
  end

  attribute :submitter_role do
    object.feedback_submission&.user&.role
  end

  attribute :assigned_to_email do
    object.assigned_to&.email
  end

  attribute :assigned_to_name do
    user = object.assigned_to
    next nil unless user

    [user.first_name, user.last_name].map(&:to_s).map(&:strip).reject(&:blank?).join(" ").presence || user.email
  end

  attribute :is_unread do
    object.feedback? && object.admin_read_at.blank?
  end

  belongs_to :job
  belongs_to :technician_profile
  belongs_to :company_profile
  has_many :messages
end
