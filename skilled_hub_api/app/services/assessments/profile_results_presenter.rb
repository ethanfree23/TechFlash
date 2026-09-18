# frozen_string_literal: true

module Assessments
  # Builds the assessment block attached to a technician profile payload, and
  # decides who is allowed to see it.
  #
  # Shared by TechnicianProfileSerializer, TechnicianProfileDetailSerializer and
  # the dedicated results endpoint, so the company-facing result is rendered by
  # one component rather than reimplemented per surface. That also means the
  # visibility rule and the disclaimer cannot drift between screens.
  #
  # Visibility: the owning technician, companies, and admins. Only the
  # designated public result is ever exposed here — never attempt history, and
  # never answer-key data.
  class ProfileResultsPresenter
    attr_reader :technician_profile, :viewer

    def initialize(technician_profile:, viewer:)
      @technician_profile = technician_profile
      @viewer = viewer
    end

    def visible?
      return false if viewer.blank? || technician_profile.blank?
      return true if viewer.admin? || viewer.company?

      viewer.technician? && viewer.technician_profile&.id == technician_profile.id
    end

    # nil (rather than an empty structure) when the viewer is not authorized, so
    # a serializer can simply omit the attribute.
    def payload(include_categories: true)
      return nil unless visible?

      results = ordered_results
      return { "results" => [], "primary" => nil, "disclaimer" => Disclaimer.for } if results.empty?

      serialized = results.map do |result|
        TechnicianAssessmentResultSerializer
          .new(result, include_categories: include_categories)
          .as_json
          .stringify_keys
      end

      {
        "results" => serialized,
        "primary" => serialized.first,
        "disclaimer" => Disclaimer.for(results.first.assessment)
      }
    end

    private

    # A technician's own trade assessment first, then highest score, so the
    # profile headline is the most relevant result rather than an incidental one.
    def ordered_results
      @ordered_results ||= begin
        trade_labels = MembershipPolicy
                       .technician_trade_labels(technician_profile)
                       .map { |label| label.to_s.downcase }

        TechnicianAssessmentResult
          .where(technician_profile_id: technician_profile.id)
          .includes(:assessment, :assessment_version)
          .to_a
          .sort_by do |result|
            primary = trade_labels.include?(result.assessment.trade_type.to_s.downcase) ? 0 : 1
            [primary, -result.score.to_i, result.assessment.position]
          end
      end
    end
  end
end
