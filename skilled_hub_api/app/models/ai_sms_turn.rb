# frozen_string_literal: true

class AiSmsTurn < ApplicationRecord
  DIRECTIONS = %w[inbound outbound system].freeze

  belongs_to :ai_sms_session

  validates :direction, presence: true, inclusion: { in: DIRECTIONS }
end
