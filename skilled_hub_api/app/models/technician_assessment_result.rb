# frozen_string_literal: true

# The one result a technician publishes to companies for a given assessment.
#
# This is a projection, not a source of truth: Assessments::PublicResultProjector
# rebuilds it from completed attempts whenever an attempt finishes. It exists so
# that (a) company-facing reads never have to reason about attempt history, and
# (b) technician search can filter on score, band or category score with indexed
# SQL rather than scanning attempts.
#
# `selection_rule` records which rule produced the displayed attempt, so
# switching an assessment from best score to latest score later is a config
# change plus a recompute, not a schema change.
class TechnicianAssessmentResult < ApplicationRecord
  belongs_to :technician_profile
  belongs_to :assessment
  belongs_to :assessment_attempt
  belongs_to :assessment_version

  validates :selection_rule, inclusion: { in: Assessment::PUBLIC_RESULT_RULES }
  validates :score, numericality: { only_integer: true, in: 0..100 }
  validates :completed_at, presence: true
  validates :technician_profile_id, uniqueness: { scope: :assessment_id }

  scope :min_score, ->(value) { where(score: value.to_i..) }
  scope :for_band, ->(slug) { where(score_band_slug: slug.to_s) }
  scope :for_trade, ->(label) { joins(:assessment).merge(Assessment.for_trade(label)) }

  # Category scores are denormalized onto the projection for display. Filtering
  # on a category score joins assessment_attempt_category_results through
  # assessment_attempt_id, which is indexed.
  def category_scores_list
    Array(category_scores).map { |entry| entry.to_h.stringify_keys }
  end

  def retake_improved?
    best_score.present? && latest_score.present? && latest_score > best_score
  end
end
