# frozen_string_literal: true

module Assessments
  # Builds what one technician sees in their Skills Assessments section: every
  # takeable assessment, their state on each, and whether they may start now.
  #
  # Recommendation is by trade. Once the HVAC / Plumbing / Electrical banks
  # exist, an HVAC technician sees the HVAC assessment recommended first purely
  # because Assessment#trade_type matches one of their trade labels — no
  # per-trade code. Assessments for other trades stay visible but unrecommended,
  # since technicians often work across trades.
  class TechnicianCatalog
    Entry = Struct.new(
      :assessment,
      :version,
      :recommended,
      :state,
      :in_progress_attempt,
      :public_result,
      :retake_decision,
      :attempts_count,
      keyword_init: true
    ) do
      def recommended?
        recommended
      end
    end

    STATE_NOT_STARTED = "not_started"
    STATE_IN_PROGRESS = "in_progress"
    STATE_COMPLETED = "completed"

    attr_reader :technician_profile

    def self.call(technician_profile:)
      new(technician_profile: technician_profile).call
    end

    def initialize(technician_profile:)
      @technician_profile = technician_profile
    end

    def call
      AttemptExpirer.sweep_for(technician_profile: technician_profile)

      entries = takeable_assessments.map { |assessment| build_entry(assessment) }

      # Recommended trade assessments first, then the platform's configured order.
      entries.sort_by.with_index do |entry, index|
        [entry.recommended? ? 0 : 1, entry.assessment.position, index]
      end
    end

    def entry_for(assessment)
      build_entry(assessment)
    end

    def recommended_trade_labels
      @recommended_trade_labels ||= MembershipPolicy
                                    .technician_trade_labels(technician_profile)
                                    .map { |label| label.to_s.downcase }
    end

    private

    def takeable_assessments
      Assessment
        .active
        .includes(assessment_versions: :assessment_categories)
        .order(:position, :id)
        .select(&:takeable?)
    end

    def build_entry(assessment)
      version = assessment.live_version
      decision = RetakePolicy.new(
        technician_profile: technician_profile,
        assessment: assessment,
        version: version
      ).decision

      live_attempt = decision.resumable_attempt
      result = public_results[assessment.id]

      Entry.new(
        assessment: assessment,
        version: version,
        recommended: recommended?(assessment),
        state: state_for(live_attempt, result),
        in_progress_attempt: live_attempt,
        public_result: result,
        retake_decision: decision,
        attempts_count: attempt_counts[assessment.id].to_i
      )
    end

    def recommended?(assessment)
      return false if assessment.trade_type.blank?

      recommended_trade_labels.include?(assessment.trade_type.to_s.downcase)
    end

    def state_for(live_attempt, result)
      return STATE_IN_PROGRESS if live_attempt.present?
      return STATE_COMPLETED if result.present?

      STATE_NOT_STARTED
    end

    def public_results
      @public_results ||= TechnicianAssessmentResult
                          .where(technician_profile_id: technician_profile.id)
                          .index_by(&:assessment_id)
    end

    def attempt_counts
      @attempt_counts ||= AssessmentAttempt
                          .where(technician_profile_id: technician_profile.id)
                          .group(:assessment_id)
                          .count
    end
  end
end
