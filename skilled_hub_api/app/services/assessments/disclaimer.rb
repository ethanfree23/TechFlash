# frozen_string_literal: true

module Assessments
  # The single source of the wording that keeps a TechFlash knowledge score from
  # being read as a license, certification or guarantee of field competency.
  #
  # Every surface that shows a score to a company — technician profile, search
  # card, applicant view — reads its copy from here, so the product can never
  # end up with one screen that qualifies the score and another that does not.
  # Per-assessment overrides are supported via Assessment#company_disclaimer.
  class Disclaimer
    DEFAULT = "TechFlash Knowledge Assessments measure responses to trade-related knowledge " \
              "questions. Scores are not licenses, certifications, or guarantees of field competency."

    # Compact form for cards and tooltips where the full sentence is too long.
    SHORT = "Knowledge score only — not a license or certification."

    def self.for(assessment = nil)
      assessment&.company_disclaimer.presence || DEFAULT
    end

    def self.short
      SHORT
    end
  end
end
