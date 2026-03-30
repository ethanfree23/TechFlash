class ConversationSerializer < ActiveModel::Serializer
  attributes :id, :conversation_type, :job_id, :technician_profile_id, :company_profile_id,
             :feedback_submission_id, :created_at, :updated_at

  attribute :feedback_kind do
    object.feedback_submission&.kind
  end

  # Inbox filter for admin: "feedback" | "job" (only feedback used for admin notifications today)
  attribute :inbox_category do
    object.feedback? ? "feedback" : "job"
  end

  attribute :submitter_email do
    object.feedback_submission&.user&.email
  end

  belongs_to :job
  belongs_to :technician_profile
  belongs_to :company_profile
  has_many :messages
end 