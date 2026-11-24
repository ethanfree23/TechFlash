# frozen_string_literal: true

# Conservative grandfathering for established technician accounts.
# Dry-run only by default — never bulk-mutates production without an explicit call.
class TechnicianOnboardingGrandfathering
  ESTABLISHED_ACTIVATION = %w[ready available placed].freeze

  Result = Struct.new(
    :total_technicians,
    :would_grandfather,
    :would_require,
    :ambiguous,
    :samples,
    keyword_init: true
  )

  def self.dry_run(limit_samples: 25)
    new.dry_run(limit_samples: limit_samples)
  end

  def self.grandfather_eligible!(user, reason: nil)
    new.grandfather_one!(user, reason: reason)
  end

  def self.apply_grandfathering!(dry_run: true)
    new.apply!(dry_run: dry_run)
  end

  def dry_run(limit_samples: 25)
    classify(limit_samples: limit_samples)
  end

  def apply!(dry_run: true)
    result = classify(limit_samples: 0)
    return result if dry_run

    User.technician.includes(:technician_profile, :technician_activation, :technician_onboarding).find_each do |user|
      decision = decision_for(user)
      next unless decision[:action] == :grandfather

      record = TechnicianOnboarding.ensure_for!(user)
      next if record.completed? && record.required_by_admin_at.blank?

      record.mark_grandfathered!(reason: decision[:reason])
    end

    result
  end

  def grandfather_one!(user, reason: nil)
    return nil unless user&.technician?

    decision = decision_for(user)
    record = TechnicianOnboarding.ensure_for!(user)
    record.mark_grandfathered!(reason: reason.presence || decision[:reason] || "manual")
    record
  end

  def decision_for(user)
    profile = user.technician_profile
    return { action: :skip, reason: "no_profile" } unless profile

    record = user.technician_onboarding
    if record&.required_by_admin_at.present?
      return { action: :require, reason: "admin_required" }
    end
    if record&.completed?
      return { action: :skip, reason: "already_complete" }
    end

    completed_jobs = MembershipPolicy.technician_completed_jobs_count(profile)
    payout_ready = profile.stripe_account_id.present? &&
                   (profile.stripe_payouts_enabled || profile.stripe_details_submitted)
    completeness = MembershipPolicy.technician_profile_completeness_percent(profile)
    activation_status = user.technician_activation&.status.to_s
    established_activation = ESTABLISHED_ACTIVATION.include?(activation_status)

    # Clear established operational accounts — grandfather.
    if completed_jobs >= 1
      return { action: :grandfather, reason: "has_completed_jobs", completed_jobs: completed_jobs }
    end

    if profile.background_verified && payout_ready && completeness >= 80
      return { action: :grandfather, reason: "verified_payout_ready_complete_profile", completeness: completeness }
    end

    if established_activation && profile.background_verified && completeness >= 60
      return { action: :grandfather, reason: "activation_#{activation_status}", completeness: completeness }
    end

    # Clearly incomplete / never set up — require onboarding.
    if completeness < 40 || profile.trade_type.blank? || (user.phone.blank? && profile.phone.blank?)
      return { action: :require, reason: "incomplete_profile", completeness: completeness }
    end

    # Ambiguous: treat as require (conservative), surface separately in dry-run.
    {
      action: :require,
      reason: "ambiguous_conservative_require",
      ambiguous: true,
      completeness: completeness,
      background_verified: profile.background_verified,
      payout_ready: payout_ready,
      activation_status: activation_status.presence || "new"
    }
  end

  private

  def classify(limit_samples:)
    would_grandfather = []
    would_require = []
    ambiguous = []

    User.technician.includes(:technician_profile, :technician_activation, :technician_onboarding).find_each do |user|
      decision = decision_for(user)
      row = {
        user_id: user.id,
        email: user.email,
        action: decision[:action],
        reason: decision[:reason],
        completeness: decision[:completeness],
        ambiguous: decision[:ambiguous] == true
      }

      case decision[:action]
      when :grandfather
        would_grandfather << row
      when :require
        if decision[:ambiguous]
          ambiguous << row
        else
          would_require << row
        end
      end
    end

    Result.new(
      total_technicians: User.technician.count,
      would_grandfather: would_grandfather.size,
      would_require: would_require.size + ambiguous.size,
      ambiguous: ambiguous.size,
      samples: {
        grandfather: would_grandfather.first(limit_samples),
        require: would_require.first(limit_samples),
        ambiguous: ambiguous.first(limit_samples)
      }
    )
  end
end
