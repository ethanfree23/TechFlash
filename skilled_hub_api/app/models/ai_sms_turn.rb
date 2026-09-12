# frozen_string_literal: true

class AiSmsTurn < ApplicationRecord
  DIRECTIONS = %w[inbound outbound system].freeze

  belongs_to :ai_sms_session

  validates :direction, presence: true, inclusion: { in: DIRECTIONS }

  before_validation :assign_received_at, on: :create

  private

  def assign_received_at
    self.received_at ||= Time.current
  end
end
