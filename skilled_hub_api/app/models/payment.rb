# frozen_string_literal: true

class Payment < ApplicationRecord
  belongs_to :job
  has_many :job_payment_transactions, dependent: :destroy

  STATUSES = %w[pending held released failed refunded].freeze

  validates :amount_cents, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :status, inclusion: { in: STATUSES }

  scope :held, -> { where(status: 'held') }
  scope :released, -> { where(status: 'released') }
  scope :releasable, -> { held }
end
