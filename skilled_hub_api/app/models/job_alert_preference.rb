class JobAlertPreference < ApplicationRecord
  belongs_to :user

  validates :max_distance_miles, numericality: { greater_than: 0 }
  validates :min_hourly_rate_cents, numericality: { greater_than_or_equal_to: 0 }
  validates :min_duration_weeks, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :max_duration_weeks, numericality: { only_integer: true, greater_than_or_equal_to: 1 }, allow_nil: true
  validate :duration_range_consistent

  private

  def duration_range_consistent
    return if min_duration_weeks.nil? || max_duration_weeks.nil?
    return unless max_duration_weeks < min_duration_weeks

    errors.add(:max_duration_weeks, "must be greater than or equal to min duration")
  end
end
