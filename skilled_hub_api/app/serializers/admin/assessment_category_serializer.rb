# frozen_string_literal: true

module Admin
  # Admin view of a blueprint category, with the bank health numbers an author
  # needs: how many questions this category draws per attempt versus how many
  # usable questions actually exist to draw from.
  class AssessmentCategorySerializer < ActiveModel::Serializer
    attributes :id,
               :assessment_version_id,
               :slug,
               :name,
               :description,
               :question_count,
               :weight,
               :position,
               :bank_size,
               :usable_bank_size,
               :bank_sufficient,
               :created_at,
               :updated_at

    def weight
      object.weight.to_f
    end

    def bank_size
      questions.size
    end

    def usable_bank_size
      usable_questions.size
    end

    def bank_sufficient
      usable_questions.size >= object.question_count.to_i
    end

    private

    def questions
      @questions ||= object.assessment_questions.active.includes(:assessment_answer_choices).to_a
    end

    def usable_questions
      @usable_questions ||= questions.select(&:answer_key_complete?)
    end
  end
end
