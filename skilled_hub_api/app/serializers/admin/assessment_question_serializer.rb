# frozen_string_literal: true

module Admin
  # Admin view of a question, including its answer key and authoring warnings.
  class AssessmentQuestionSerializer < ActiveModel::Serializer
    attributes :id,
               :assessment_version_id,
               :assessment_category_id,
               :category_slug,
               :external_key,
               :prompt,
               :explanation,
               :difficulty,
               :active,
               :position,
               :media_url,
               :media_type,
               :media_alt_text,
               :metadata,
               :answer_key_complete,
               :editable,
               :created_at,
               :updated_at

    has_many :assessment_answer_choices, serializer: Admin::AssessmentAnswerChoiceSerializer

    def category_slug
      object.assessment_category&.slug
    end

    def answer_key_complete
      object.answer_key_complete?
    end

    # False once the owning version is published, which is when the content
    # immutability guard starts rejecting writes.
    def editable
      object.assessment_version.editable?
    end
  end
end
