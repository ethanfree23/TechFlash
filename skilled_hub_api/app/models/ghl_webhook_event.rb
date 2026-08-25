# frozen_string_literal: true

class GhlWebhookEvent < ApplicationRecord
  belongs_to :user, optional: true

  validates :idempotency_key, presence: true, uniqueness: true
end
