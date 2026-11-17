# frozen_string_literal: true

# Actionable onboarding checklist for technician activation CRM.
# Reuses TechnicianVerificationInventory for verification facts — does not invent a parallel source of truth.
class TechnicianOnboardingReadiness
  def self.call(user, inventory: nil, activation: nil)
    new(user, inventory: inventory, activation: activation).to_h
  end

  def self.preload_for(users, inventories: nil, activations: nil)
    users = Array(users)
    inventories ||= TechnicianVerificationInventory.preload_for(users)
    activations ||= TechnicianActivation.where(user_id: users.map(&:id)).index_by(&:user_id)

    users.each_with_object({}) do |user, hash|
      hash[user.id] = call(
        user,
        inventory: inventories[user.id],
        activation: activations[user.id]
      )
    end
  end

  def initialize(user, inventory: nil, activation: nil)
    @user = user
    @profile = user&.technician_profile
    @inventory = inventory
    @activation = activation
  end

  def to_h
    return nil unless @user&.technician? && @profile

    inventory = @inventory || TechnicianVerificationInventory.call(@user)
    items = build_items(inventory)
    blockers = items.reject { |item| item[:done] }

    {
      items: items,
      blockers: blockers,
      blocker_keys: blockers.map { |item| item[:key] },
      blocker_labels: blockers.map { |item| item[:label] },
      complete: blockers.empty?,
      percent: percent_complete(items),
      activation_status: (@activation || TechnicianActivation.find_by(user_id: @user.id))&.status || "new"
    }
  end

  private

  def build_items(inventory)
    trade = inventory&.dig(:trade_license) || {}
    refs = inventory&.dig(:professional_references) || {}
    background = inventory&.dig(:background_check) || {}

    [
      item(
        key: "background_check",
        label: "Background check",
        done: background_done?(background),
        detail: background[:label] || background[:status] || background[:color_bucket],
        href: "/admin/trust-safety",
        action: "Review in Trust & Safety"
      ),
      item(
        key: "trade_license",
        label: "Trade license",
        done: trade_license_done?(trade),
        detail: trade[:label] || trade[:status],
        href: "/admin/users/#{@user.id}",
        action: "Edit technician profile"
      ),
      item(
        key: "references",
        label: "References",
        done: references_done?(refs),
        detail: refs[:label] || "#{refs[:count].to_i}/#{TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT}",
        href: "/admin/trust-safety",
        action: "Review references"
      ),
      item(
        key: "profile",
        label: "Profile completion",
        done: profile_complete?,
        detail: profile_missing.join(", ").presence,
        href: "/admin/users/#{@user.id}",
        action: "Complete profile"
      ),
      item(
        key: "payout_setup",
        label: "Payout setup",
        done: payout_ready?,
        detail: payout_detail,
        href: "/admin/users/#{@user.id}",
        action: "Check Stripe Connect"
      ),
      item(
        key: "assessments",
        label: "Assessments",
        done: assessment_ok?,
        detail: assessment_detail,
        href: "/admin/users/#{@user.id}",
        action: "View assessments",
        optional: !assessment_required?
      )
    ]
  end

  def item(key:, label:, done:, detail:, href:, action:, optional: false)
    {
      key: key,
      label: label,
      done: !!done,
      detail: detail.presence,
      href: href,
      action: action,
      optional: optional
    }
  end

  def background_done?(background)
    return true if @profile.background_verified
    return true if background[:complete] == true
    return true if background[:color_bucket].to_s == "passed"
    return true if background[:state].to_s == "clear"

    false
  end

  def trade_license_done?(trade)
    return true if trade[:complete] == true
    return true if trade[:state].to_s == "yes"

    Array(trade[:documents]).any? { |doc| doc.is_a?(Hash) && (doc[:complete] || doc["complete"]) }
  end

  def references_done?(refs)
    return true if refs[:complete] == true

    refs[:count].to_i >= TechnicianVerificationInventory::COMPLETE_REFERENCE_COUNT
  end

  def profile_complete?
    profile_missing.empty?
  end

  def profile_missing
    missing = []
    missing << "Phone" if @user.phone.blank? && @profile.phone.blank?
    missing << "Name" if @user.first_name.blank? || @user.last_name.blank?
    missing << "Trade" if @profile.trade_type.blank?
    missing << "Location" if @profile.city.blank? && @profile.location.blank? && @profile.zip_code.blank?
    missing << "Photo" unless @profile.avatar.attached?
    missing
  end

  def payout_ready?
    @profile.stripe_account_id.present? && (@profile.stripe_payouts_enabled || @profile.stripe_details_submitted)
  end

  def payout_detail
    return "Connected" if payout_ready?
    return "Account started" if @profile.stripe_account_id.present?

    "Not started"
  end

  def assessment_result
    @assessment_result ||= @profile.technician_assessment_results.order(completed_at: :desc, id: :desc).first
  end

  def assessment_required?
    # Assessments are informational for activation until product requires a specific bank.
    false
  end

  def assessment_ok?
    return true unless assessment_required?
    return true if assessment_result&.passed
    return true if assessment_result&.score.present?

    false
  end

  def assessment_detail
    result = assessment_result
    return "No attempt yet" unless result
    return "Passed (#{result.score})" if result.passed
    return "Score #{result.score}" if result.score.present?

    "In progress"
  end

  def percent_complete(items)
    required = items.reject { |item| item[:optional] }
    return 100 if required.empty?

    ((required.count { |item| item[:done] }.to_f / required.size) * 100).round
  end
end
