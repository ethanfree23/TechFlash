class FeedbackSubmission < ApplicationRecord
  KINDS = %w[problem suggestion].freeze

  belongs_to :user

  validates :kind, presence: true, inclusion: { in: KINDS }
  validates :body, presence: true, length: { maximum: 10_000 }
  validates :page_path, length: { maximum: 2048 }, allow_blank: true
end
