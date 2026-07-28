# frozen_string_literal: true

class TimeEntryPayLine < ApplicationRecord
  belongs_to :time_entry
  belongs_to :job

  enum premium_combination_rule: {
    highest_applicable: 0,
    stacked: 1
  }, _scopes: false

  validates :base_hourly_rate_cents, :effective_hourly_rate_cents, :gross_pay_cents, presence: true
  validates :worked_hours, numericality: { greater_than: 0 }
  validates :applied_multiplier, numericality: { greater_than_or_equal_to: 1.0 }
end
