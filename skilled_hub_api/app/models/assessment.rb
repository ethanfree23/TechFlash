# frozen_string_literal: true

# A TechFlash knowledge assessment for a single trade (for example "HVAC
# Knowledge Assessment"). The Assessment record is the stable, long-lived
# identity; all question content, scoring configuration and attempt rules live
# on AssessmentVersion so historical results stay meaningful when content
# changes. See docs/ASSESSMENTS.md.
class Assessment < ApplicationRecord
  # How a technician's single company-facing result is chosen from their
  # completed attempts. Swappable per assessment without a migration.
  PUBLIC_RESULT_RULES = %w[best_valid latest_valid].freeze

  has_many :assessment_versions, -> { order(version_number: :desc) }, dependent: :destroy
  has_many :assessment_categories, through: :assessment_versions
  has_many :assessment_questions, through: :assessment_versions
  has_many :assessment_attempts, dependent: :restrict_with_error
  has_many :technician_assessment_results, dependent: :destroy

  validates :slug, presence: true, uniqueness: true, format: {
    with: /\A[a-z0-9]+(?:_[a-z0-9]+)*\z/,
    message: "must be lowercase letters, numbers and underscores"
  }
  validates :title, presence: true
  validates :public_result_rule, inclusion: { in: PUBLIC_RESULT_RULES }
  validate :trade_type_must_be_catalog_value

  before_validation :normalize_trade_type

  scope :active, -> { where(active: true) }
  scope :for_trade, ->(label) {
    normalized = TradeCatalog.normalized_label(label)
    normalized.present? ? where(trade_type: normalized) : none
  }

  # The version technicians are served right now. Highest published version wins
  # so publishing v2 immediately routes new attempts to it.
  def live_version
    assessment_versions.published.order(version_number: :desc).first
  end

  def latest_version
    assessment_versions.order(version_number: :desc).first
  end

  def draft_versions
    assessment_versions.draft
  end

  def next_version_number
    (assessment_versions.maximum(:version_number) || 0) + 1
  end

  def takeable?
    active? && live_version.present?
  end

  private

  def normalize_trade_type
    normalized = TradeCatalog.normalized_label(trade_type)
    self.trade_type = normalized if normalized.present?
  end

  def trade_type_must_be_catalog_value
    return if trade_type.blank?
    return if TradeCatalog.valid_label?(trade_type)

    errors.add(:trade_type, "is not a recognized TechFlash trade")
  end
end
