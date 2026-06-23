class VerificationEligibilityService
  BLOCK_BACKGROUND = "background_check_required".freeze
  BLOCK_IDENTITY = "identity_verification_required".freeze
  BLOCK_REFERENCES = "verified_references_required".freeze
  BLOCK_INSURANCE = "insurance_verification_required".freeze
  BLOCK_CERTS = "required_certifications_missing".freeze

  Result = Struct.new(:eligible, :reasons, keyword_init: true)

  def self.call(job:, technician_profile:)
    new(job: job, technician_profile: technician_profile).call
  end

  def initialize(job:, technician_profile:)
    @job = job
    @technician_profile = technician_profile
    @user = technician_profile&.user
  end

  def call
    reasons = []
    return Result.new(eligible: false, reasons: [{ code: "technician_profile_required", message: "Complete your technician profile first." }]) if @technician_profile.blank?

    verification_profile = VerificationProfile.for_user!(@user)
    background_check = BackgroundCheck.where(user_id: @user.id).order(created_at: :desc).first
    active_badges = VerificationBadge.active_now.where(user_id: @user.id).pluck(:badge_type)

    if @job.require_background_check? && !(background_check&.eligible_for_background_gate?)
      reasons << reason(BLOCK_BACKGROUND, "This job requires Background Check verification.")
    end
    if @job.require_identity_verification? && verification_profile.identity_status.to_s != "verified"
      reasons << reason(BLOCK_IDENTITY, "This job requires Identity verification.")
    end
    if @job.minimum_verified_references.to_i > 0
      refs_badge = active_badges.include?("references_verified_#{@job.minimum_verified_references}")
      refs_generic = active_badges.include?("references_verified")
      unless refs_badge || refs_generic
        reasons << reason(BLOCK_REFERENCES, "This job requires #{@job.minimum_verified_references} verified references.")
      end
    end
    if @job.require_insurance_verification? && verification_profile.insurance_status.to_s != "verified"
      reasons << reason(BLOCK_INSURANCE, "This job requires insurance verification.")
    end
    if @job.required_certifications.present?
      required = @job.required_certifications.split(",").map(&:strip).reject(&:blank?)
      normalized_badges = active_badges.map { |b| b.to_s.downcase }
      missing = required.reject do |cert|
        normalized = cert.downcase.gsub(/\s+/, "_")
        normalized_badges.include?("cert_#{normalized}") || normalized_badges.include?(normalized)
      end
      if missing.any?
        reasons << reason(BLOCK_CERTS, "Missing required certifications: #{missing.join(', ')}.")
      end
    end

    Result.new(eligible: reasons.empty?, reasons: reasons)
  end

  private

  def reason(code, message)
    { code: code, message: message }
  end
end
