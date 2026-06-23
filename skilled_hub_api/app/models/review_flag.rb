class ReviewFlag < ApplicationRecord
  belongs_to :rating
  belongs_to :reviewed_by, class_name: "User", optional: true

  enum :status, {
    open: 0,
    dismissed: 1,
    resolved: 2
  }, default: :open

  validates :reason, presence: true
  validates :risk_score, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
end
