# frozen_string_literal: true

class MembershipSignupService
  def self.checkout_after_create!(user:, requested_level:, success_url:, cancel_url:)
    profile = MembershipSubscriptionService.profile_for(user)
    return { user: user } if profile.blank?

    audience = user.company? ? :company : :technician
    level = MembershipPolicy.normalized_level(requested_level, audience: audience)
    rule = MembershipPolicy.rules_for_audience(audience)[level]
    if rule.blank? || rule[:fee_cents].to_i <= 0
      profile.update!(membership_level: level, membership_status: "active", pending_membership_level: nil)
      return { user: user }
    end

    default_level = MembershipPolicy.default_slug_for(audience)
    profile.update!(
      membership_level: default_level,
      membership_status: "incomplete",
      pending_membership_level: level
    )

    result = MembershipSubscriptionService.create_checkout_session!(
      user: user,
      membership_level: level,
      success_url: success_url,
      cancel_url: cancel_url
    )
    { user: user, checkout: result, pending_membership_level: level }
  end
end
