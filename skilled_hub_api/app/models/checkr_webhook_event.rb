class CheckrWebhookEvent < ApplicationRecord
  belongs_to :background_check, optional: true

  validates :checkr_event_id, presence: true, uniqueness: true

  scope :retryable, -> { where(processed_at: nil).where.not(processing_error: [nil, ""]) }
  scope :unmatched, -> { where(background_check_id: nil).where("processing_error LIKE ?", "%unmatched%") }
end
