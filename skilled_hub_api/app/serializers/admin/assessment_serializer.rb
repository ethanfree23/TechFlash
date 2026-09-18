# frozen_string_literal: true

module Admin
  # Admin index/detail view of an assessment and its version history.
  class AssessmentSerializer < ActiveModel::Serializer
    attributes :id,
               :slug,
               :title,
               :description,
               :company_disclaimer,
               :effective_disclaimer,
               :trade_type,
               :active,
               :public_result_rule,
               :position,
               :metadata,
               :live_version_number,
               :live_version_id,
               :versions_count,
               :attempts_count,
               :completed_attempts_count,
               :technicians_with_results_count,
               :created_at,
               :updated_at

    attribute :versions, if: :include_versions?

    def effective_disclaimer
      Assessments::Disclaimer.for(object)
    end

    def live_version_number
      live_version&.version_number
    end

    def live_version_id
      live_version&.id
    end

    def versions_count
      object.assessment_versions.count
    end

    def attempts_count
      object.assessment_attempts.count
    end

    def completed_attempts_count
      object.assessment_attempts.completed.count
    end

    def technicians_with_results_count
      object.technician_assessment_results.count
    end

    def include_versions?
      instance_options.fetch(:include_versions, false)
    end

    def versions
      object.assessment_versions.order(version_number: :desc).map do |version|
        Admin::AssessmentVersionSerializer.new(version).as_json
      end
    end

    private

    def live_version
      @live_version ||= object.live_version
    end
  end
end
