class Document < ApplicationRecord
  belongs_to :uploadable, polymorphic: true
  belongs_to :reviewed_by_user, class_name: "User", optional: true
  has_one_attached :file

  enum :status, {
    pending_review: 0,
    approved: 1,
    rejected: 2
  }, default: :pending_review

  validates :doc_type, presence: true

  scope :pending_review_queue, -> { where(status: :pending_review).order(created_at: :asc) }
end
