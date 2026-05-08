class JobAlertPreference < ApplicationRecord
  belongs_to :user

  validates :max_distance_miles, numericality: { greater_than: 0 }
  validates :min_hourly_rate_cents, numericality: { greater_than_or_equal_to: 0 }
  validates :max_duration_days, numericality: { greater_than: 0 }
end
