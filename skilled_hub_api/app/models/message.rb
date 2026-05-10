
class Message < ApplicationRecord
  include ContentSafetyValidations

  belongs_to :conversation
  belongs_to :sender, polymorphic: true

  validates :content, presence: true
  validates_safe_text :content, max_length: 2_000
end
