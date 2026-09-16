# frozen_string_literal: true

# An informational "how complete is my profile" score for technicians.
#
# This is a display surface only. It is intentionally separate from
# MembershipPolicy.technician_profile_completeness_percent, which gates job
# access: that calculation is left untouched so existing technicians keep
# exactly the job eligibility they have today. Nothing here can make a
# technician ineligible for anything.
#
# Core profile fields mirror the membership gate's five fields so the two never
# disagree about the basics; verification and knowledge assessment are additive
# steps on top.
class TechnicianProfileStrength
  CORE_WEIGHT_PERCENT = 55
  VERIFICATION_WEIGHT_PERCENT = 30

  def self.call(technician_profile)
    new(technician_profile).to_h
  end

  attr_reader :technician_profile

  def initialize(technician_profile)
    @technician_profile = technician_profile
  end

  def to_h
    return nil if technician_profile.blank?

    assessment = Assessments::ProfileContribution.call(technician_profile: technician_profile)
    core = core_items
    verification = verification_items

    earned = weighted_percent(core, CORE_WEIGHT_PERCENT) +
             weighted_percent(verification, VERIFICATION_WEIGHT_PERCENT) +
             assessment.earned_strength_percent.to_i

    {
      percent: earned.clamp(0, 100),
      counts_toward_job_access: false,
      core: {
        weight_percent: CORE_WEIGHT_PERCENT,
        items: core
      },
      verification: {
        weight_percent: VERIFICATION_WEIGHT_PERCENT,
        items: verification
      },
      assessment: assessment.as_json,
      next_steps: next_steps(core, verification, assessment)
    }
  end

  private

  def core_items
    service_area = technician_profile.city.presence || technician_profile.location.presence

    [
      item("trade_type", "Primary trade", technician_profile.trade_type.present?),
      item("availability", "Availability", technician_profile.availability.present?),
      item("bio", "Profile summary", technician_profile.bio.present?),
      item("phone", "Phone number", technician_profile.phone.present?),
      item("service_area", "Service area", service_area.present?)
    ]
  end

  def verification_items
    user = technician_profile.user
    references = user ? VerificationReference.where(technician_user_id: user.id).count : 0

    [
      item("trade_credential", "Trade credential", trade_credential_present?),
      item("professional_references", "Professional references",
           references >= TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT),
      item("background_check", "Background check", technician_profile.background_verified == true)
    ]
  end

  def trade_credential_present?
    Document
      .where(uploadable: technician_profile, doc_type: TechnicianVerificationInventory::TRADE_LICENSE_DOC_TYPES)
      .exists?
  end

  def item(key, label, complete)
    { key: key, label: label, complete: !!complete }
  end

  def weighted_percent(items, weight)
    return 0 if items.empty?

    complete = items.count { |entry| entry[:complete] }
    ((complete.to_f / items.size) * weight).floor
  end

  def next_steps(core, verification, assessment)
    steps = (core + verification).reject { |entry| entry[:complete] }.map do |entry|
      { key: entry[:key], label: "Add your #{entry[:label].downcase}" }
    end

    unless assessment.completed?
      if assessment.recommended_assessment_title.present?
        steps << {
          key: "skills_assessment",
          label: "Take the #{assessment.recommended_assessment_title}",
          optional: true
        }
      end
    end

    steps
  end
end
