# frozen_string_literal: true

class Payment < ApplicationRecord
  belongs_to :job

  STATUSES = %w[pending held released failed refunded].freeze

  validates :amount_cents, presence: true, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: STATUSES }

  scope :held, -> { where(status: 'held') }
  scope :released, -> { where(status: 'released') }
  scope :releasable, -> { held }
end
