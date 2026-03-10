class ConversationSerializer < ActiveModel::Serializer
  attributes :id, :job_id, :technician_profile_id, :company_profile_id, :created_at, :updated_at

  belongs_to :job
  belongs_to :technician_profile
  belongs_to :company_profile
  has_many :messages
end 