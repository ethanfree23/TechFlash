# frozen_string_literal: true

# Per-category breakdown for a completed attempt, for example
# "Safety & Tools: 9/10 = 90".
#
# The category slug and name are copied in rather than only referenced so a
# historical result still reads correctly if a later version renames or drops
# the category, and so companies can eventually filter on a category score with
# a plain indexed join instead of JSON traversal.
class AssessmentAttemptCategoryResult < ApplicationRecord
  belongs_to :assessment_attempt, inverse_of: :assessment_attempt_category_results
  belongs_to :assessment_category

  validates :category_slug, presence: true, uniqueness: { scope: :assessment_attempt_id }
  validates :category_name, presence: true
  validates :score, numericality: { only_integer: true, in: 0..100 }

  scope :ordered, -> { order(:position, :id) }

  def as_public_json
    {
      "slug" => category_slug,
      "name" => category_name,
      "score" => score,
      "questions_count" => questions_count,
      "correct_count" => correct_count
    }
  end
end
