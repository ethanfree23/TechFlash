# frozen_string_literal: true

class BackgroundCheckAcknowledgementService
  class Error < StandardError; end

  def self.upsert!(user:, acknowledgement_type:, accepted:, actor_user:, ip_address: nil, user_agent: nil)
    type = acknowledgement_type.to_s
    unless BackgroundCheckAcknowledgement::TYPES.include?(type)
      raise Error, "Unknown acknowledgement type."
    end

    version = BackgroundCheckAcknowledgement.current_version_for(type)
    accepted_bool = ActiveModel::Type::Boolean.new.cast(accepted) == true

    row = BackgroundCheckAcknowledgement.find_or_initialize_by(user_id: user.id, acknowledgement_type: type)
    row.actor_user_id = actor_user.id
    row.document_version = version
    row.ip_address = ip_address.to_s.presence
    row.user_agent = user_agent.to_s.presence&.slice(0, 512)
    if accepted_bool
      row.accepted = true
      row.accepted_at ||= Time.current
    else
      row.accepted = false
      row.accepted_at = nil
    end
    row.save!
    row
  end
end
