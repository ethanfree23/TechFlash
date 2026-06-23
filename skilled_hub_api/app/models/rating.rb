class Rating < ApplicationRecord
  REVIEW_WINDOW_DAYS = 14
  MIN_COMMENT_LENGTH = 40

  # Company -> technician
  COMPANY_REVIEW_CATEGORIES = {
    reliability: "Reliability",
    quality_of_work: "Quality of Work",
    communication: "Communication",
    professionalism: "Professionalism",
    safety: "Safety",
    overall_experience: "Overall Experience"
  }.freeze

  # Technician -> company
  TECH_REVIEW_CATEGORIES = {
    communication: "Communication",
    site_preparedness: "Site Preparedness",
    job_description_accuracy: "Accuracy of Job Description",
    payment_experience: "Payment Experience",
    professionalism: "Professionalism",
    overall_experience: "Overall Experience"
  }.freeze

  LEGACY_COMPANY_REVIEW_CATEGORIES = {
    punctuality: "Show up on time",
    attention_to_detail: "Attention to detail / Following instructions",
    teamwork: "Work well with others",
    job_satisfaction: "Complete the job to satisfaction",
    communication: "Clear communication"
  }.freeze

  LEGACY_TECH_REVIEW_CATEGORIES = {
    job_title_accuracy: "Job title matched the actual work",
    materials_provided: "Provided everything needed (materials, etc.)",
    time_respect: "Respected my time (no unexpected overtime)",
    ease_to_work_with: "Easy to work with",
    would_work_again: "Would work with again"
  }.freeze

  belongs_to :job
  belongs_to :reviewer, polymorphic: true
  belongs_to :reviewee, polymorphic: true
  belongs_to :hidden_by_user, class_name: "User", optional: true
  has_many :review_flags, dependent: :destroy

  enum :on_time_status, {
    early: 0,
    on_time: 1,
    late: 2
  }, prefix: true

  enum :job_description_match, {
    yes: 0,
    partially: 1,
    no: 2
  }, prefix: true

  enum :moderation_status, {
    active: 0,
    flagged: 1,
    hidden: 2
  }, default: :active

  validate :validate_category_scores, if: -> { category_scores.present? }
  validate :validate_role_specific_answers
  validate :validate_comment_quality
  validates :score, presence: true, numericality: { greater_than_or_equal_to: 1, less_than_or_equal_to: 5 }
  validates :review_quality_weight, numericality: { greater_than_or_equal_to: 0.5, less_than_or_equal_to: 2.0 }

  before_validation :compute_score_from_categories, if: -> { category_scores.present? && score.blank? }
  before_validation :set_review_window

  def self.categories_for(reviewer_type)
    reviewer_type.to_s == 'CompanyProfile' ? COMPANY_REVIEW_CATEGORIES : TECH_REVIEW_CATEGORIES
  end

  def self.review_window_duration
    REVIEW_WINDOW_DAYS.days
  end

  def self.average_for(reviewee)
    weighted_summary_for(reviewee)[:overall_rating]
  end

  def self.weighted_summary_for(reviewee)
    return default_summary if reviewee.nil?

    ratings = where(reviewee: reviewee).where.not(moderation_status: moderation_statuses[:hidden])
    return default_summary if ratings.empty?

    now = Time.current
    overall_weighted_sum = 0.0
    overall_weight_total = 0.0
    category_weighted = Hash.new { |h, k| h[k] = { sum: 0.0, weight: 0.0 } }

    ratings.find_each do |rating|
      recency_weight = recency_weight_for(rating, now)
      quality_weight = rating.review_quality_weight.to_f
      final_weight = recency_weight * quality_weight

      overall_weighted_sum += rating.score.to_f * final_weight
      overall_weight_total += final_weight

      next unless rating.category_scores.is_a?(Hash)

      rating.category_scores.each do |key, value|
        numeric = value.to_f
        next unless numeric.between?(1.0, 5.0)

        bucket = category_weighted[key.to_s]
        bucket[:sum] += numeric * final_weight
        bucket[:weight] += final_weight
      end
    end

    total_count = ratings.count
    confidence_multiplier = [[total_count / 10.0, 1.0].min, 0.3].max
    overall = overall_weight_total.positive? ? (overall_weighted_sum / overall_weight_total) : nil
    overall = overall ? ((overall * confidence_multiplier) + (4.0 * (1.0 - confidence_multiplier))) : nil

    {
      review_count: total_count,
      overall_rating: overall&.round(2),
      categories: category_weighted.transform_values do |v|
        next nil if v[:weight] <= 0
        (v[:sum] / v[:weight]).round(2)
      end.compact,
      would_hire_again_pct: ratio_percent(ratings, :would_hire_again),
      would_recommend_pct: ratio_percent(ratings, :would_recommend),
      would_work_again_pct: ratio_percent(ratings, :would_work_again),
      payment_on_time_pct: ratio_percent(ratings, :payment_on_time),
      repeat_counterparties_count: repeat_counterparties_count(reviewee)
    }
  end

  def category_labels
    modern = self.class.categories_for(reviewer_type)
    return modern if category_scores.blank?

    keys = category_scores.keys.map(&:to_s)
    modern_keys = modern.keys.map(&:to_s)
    return modern if (keys - modern_keys).empty?

    reviewer_type.to_s == "CompanyProfile" ? LEGACY_COMPANY_REVIEW_CATEGORIES : LEGACY_TECH_REVIEW_CATEGORIES
  end

  def review_window_expired?
    review_window_expires_at.present? && review_window_expires_at <= Time.current
  end

  def visible_for_counterparty?
    visible_at.present? && visible_at <= Time.current && !hidden?
  end

  private

  def validate_category_scores
    return if category_scores.blank?
    expected_keys =
      if legacy_category_schema?
        reviewer_type.to_s == "CompanyProfile" ? LEGACY_COMPANY_REVIEW_CATEGORIES.keys.map(&:to_s) : LEGACY_TECH_REVIEW_CATEGORIES.keys.map(&:to_s)
      else
        reviewer_type.to_s == "CompanyProfile" ? COMPANY_REVIEW_CATEGORIES.keys.map(&:to_s) : TECH_REVIEW_CATEGORIES.keys.map(&:to_s)
      end
    given_keys = category_scores.keys
    missing = expected_keys - given_keys
    extra = given_keys - expected_keys
    if missing.any?
      errors.add(:category_scores, "missing required categories: #{missing.join(', ')}")
    end
    if extra.any?
      errors.add(:category_scores, "unknown categories: #{extra.join(', ')}")
    end
    return if errors[:category_scores].any?
    category_scores.each do |k, v|
      val = v.to_i
      unless val.between?(1, 5)
        errors.add(:category_scores, "#{k} must be between 1 and 5")
        break
      end
    end
  end

  def compute_score_from_categories
    return if category_scores.blank? || !category_scores.is_a?(Hash)
    values = category_scores.values.map { |v| v.to_i }.select { |v| v.between?(1, 5) }
    return if values.empty?
    self.score = (values.sum.to_f / values.size).round(2)
  end

  def validate_role_specific_answers
    return if legacy_category_schema?

    if reviewer_type.to_s == "CompanyProfile"
      errors.add(:would_hire_again, "is required") if would_hire_again.nil?
      errors.add(:would_recommend, "is required") if would_recommend.nil?
      errors.add(:request_again, "is required") if request_again.nil?
      errors.add(:on_time_status, "is required") if on_time_status.blank?
    elsif reviewer_type.to_s == "TechnicianProfile"
      errors.add(:would_work_again, "is required") if would_work_again.nil?
      errors.add(:payment_on_time, "is required") if payment_on_time.nil?
      errors.add(:job_description_match, "is required") if job_description_match.blank?
    end
  end

  def validate_comment_quality
    return if legacy_category_schema?
    return if comment.to_s.strip.length >= MIN_COMMENT_LENGTH

    errors.add(:comment, "must be at least #{MIN_COMMENT_LENGTH} characters")
  end

  def set_review_window
    return if job.blank? || job.finished_at.blank?

    self.review_window_expires_at ||= job.finished_at + self.class.review_window_duration
    self.visible_at ||= review_window_expires_at
    self.review_quality_weight = computed_quality_weight if review_quality_weight.blank? || review_quality_weight.to_f <= 0
  end

  def computed_quality_weight
    comment_len = comment.to_s.strip.length
    comment_score = [[comment_len / 200.0, 1.0].min, 0.2].max
    has_categories = category_scores.is_a?(Hash) && category_scores.size >= 5
    role_answer_bonus = reviewer_type.to_s == "CompanyProfile" ? (would_hire_again.nil? ? 0.0 : 0.15) : (would_work_again.nil? ? 0.0 : 0.15)
    base = 0.85 + (comment_score * 0.7) + (has_categories ? 0.2 : 0.0) + role_answer_bonus
    [[base, 2.0].min, 0.5].max.round(2)
  end

  def legacy_category_schema?
    return false unless category_scores.is_a?(Hash)

    keys = category_scores.keys.map(&:to_s)
    legacy_keys =
      if reviewer_type.to_s == "CompanyProfile"
        LEGACY_COMPANY_REVIEW_CATEGORIES.keys.map(&:to_s)
      else
        LEGACY_TECH_REVIEW_CATEGORIES.keys.map(&:to_s)
      end
    (keys - legacy_keys).empty?
  end

  def self.default_summary
    {
      review_count: 0,
      overall_rating: nil,
      categories: {},
      would_hire_again_pct: nil,
      would_recommend_pct: nil,
      would_work_again_pct: nil,
      payment_on_time_pct: nil,
      repeat_counterparties_count: 0
    }
  end

  def self.recency_weight_for(rating, now)
    age_days = [(now.to_f - rating.created_at.to_f) / 1.day, 0].max
    [[Math.exp(-age_days / 240.0), 1.0].min, 0.25].max
  end

  def self.ratio_percent(scope, field_name)
    yes_count = scope.where(field_name => true).count
    total = scope.where.not(field_name => nil).count
    return nil if total.zero?

    ((yes_count.to_f / total) * 100).round(1)
  end

  def self.repeat_counterparties_count(reviewee)
    if reviewee.is_a?(TechnicianProfile)
      rows = where(reviewee: reviewee, reviewer_type: "CompanyProfile").group(:reviewer_id).count
    else
      rows = where(reviewee: reviewee, reviewer_type: "TechnicianProfile").group(:reviewer_id).count
    end
    rows.values.count { |count| count > 1 }
  end
end
