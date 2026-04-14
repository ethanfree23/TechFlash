# frozen_string_literal: true

class StripeWebhookEvent < ApplicationRecord
  validates :stripe_event_id, presence: true, uniqueness: true
end
