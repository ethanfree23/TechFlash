
class Message < ApplicationRecord
  include ContentSafetyValidations

  belongs_to :conversation
  belongs_to :sender, polymorphic: true
  has_many_attached :attachments

  validate :content_or_attachments_present
  validates_safe_text :content, max_length: 2_000

  private

  def content_or_attachments_present
    return if content.to_s.strip.present? || attachments.attached?

    errors.add(:base, "Message must include text or an attachment")
  end
end
