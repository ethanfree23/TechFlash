class MessageSerializer < ActiveModel::Serializer
  attributes :id, :sender_id, :sender_type, :content, :conversation_id, :created_at, :updated_at

  attribute :sender_display_name do
    case object.sender
    when TechnicianProfile
      object.sender.user&.email || object.sender.trade_type || "Technician"
    when CompanyProfile
      object.sender.company_name || object.sender.user&.email || "Company"
    when User
      object.sender.email || "Admin"
    else
      object.sender&.try(:email) || "Unknown"
    end
  end

  belongs_to :conversation
end 