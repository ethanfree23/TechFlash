class VerificationAuditLog < ApplicationRecord
  belongs_to :user
  belongs_to :actor_user, class_name: "User"

  validates :entity_type, :entity_id, :action, presence: true

  def self.record!(user:, actor_user:, entity:, action:, details: {})
    create!(
      user_id: user.id,
      actor_user_id: actor_user.id,
      entity_type: entity.class.name,
      entity_id: entity.id,
      action: action,
      details: details
    )
  end
end
