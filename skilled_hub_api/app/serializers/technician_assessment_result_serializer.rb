# frozen_string_literal: true

# The company-facing view of a technician's assessment result.
#
# Companies see the designated result only — score, level, assessment, version
# and completion date — never the attempt history, and never a failed earlier
# attempt. The disclaimer travels with the payload so no consuming surface can
# render a score without its context.
#
# Category scores are included because they are the genuinely useful hiring
# signal; pass `include_categories: false` for compact card contexts.
class TechnicianAssessmentResultSerializer < ActiveModel::Serializer
  attributes :id,
             :assessment_id,
             :assessment_slug,
             :assessment_title,
             :trade_type,
             :score,
             :score_band_slug,
             :score_band_label,
             :completed_at,
             :version_number,
             :disclaimer

  attribute :category_scores, if: :include_categories?

  def assessment_slug
    object.assessment.slug
  end

  def assessment_title
    object.assessment.title
  end

  def trade_type
    object.assessment.trade_type
  end

  def version_number
    object.assessment_version.version_number
  end

  def category_scores
    object.category_scores_list
  end

  def include_categories?
    instance_options.fetch(:include_categories, true)
  end

  def disclaimer
    Assessments::Disclaimer.for(object.assessment)
  end
end
