class MessageSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :sender_id, :sender_type, :content, :conversation_id, :created_at, :updated_at,
             :internal, :attachments

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

  def attachments
    object.attachments.map do |attachment|
      {
        id: attachment.id,
        filename: attachment.filename.to_s,
        content_type: attachment.content_type,
        byte_size: attachment.byte_size,
        url: absolute_blob_url(attachment)
      }
    end
  end
end 