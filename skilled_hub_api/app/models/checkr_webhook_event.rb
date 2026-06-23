class CheckrWebhookEvent < ApplicationRecord
  validates :checkr_event_id, presence: true, uniqueness: true
end
