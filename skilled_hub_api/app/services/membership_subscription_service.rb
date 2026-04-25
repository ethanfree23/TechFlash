# frozen_string_literal: true

class MembershipSubscriptionService
  class Error < StandardError; end

  PRICE_ENV_KEYS = {
    "company" => {
      "pro" => "STRIPE_COMPANY_PRO_PRICE_ID",
      "premium" => "STRIPE_COMPANY_PREMIUM_PRICE_ID"
    },
    "technician" => {
      "pro" => "STRIPE_TECHNICIAN_PRO_PRICE_ID",
      "premium" => "STRIPE_TECHNICIAN_PREMIUM_PRICE_ID"
    }
  }.freeze

  def self.create_checkout_session!(user:, membership_level:, success_url:, cancel_url:)
    raise Error, "Stripe is not configured" if Stripe.api_key.blank?

    level = MembershipPolicy.normalized_level(membership_level, audience: user.role)
    rule = MembershipPolicy.rules_for_audience(user.role)[level]
    raise Error, "This tier does not require a subscription checkout" if rule.blank? || rule[:fee_cents].to_i <= 0

    profile = profile_for(user)
    raise Error, "Membership profile not found" if profile.blank?

    customer_id = StripeCustomerService.ensure_customer_id!(user)
    price_id = price_id_for(role: user.role, level: level)
    raise Error, "Price ID is not configured for #{user.role} #{level}" if price_id.blank?

    session = Stripe::Checkout::Session.create(
      mode: "subscription",
      customer: customer_id,
      payment_method_types: ["card"],
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: {
        user_id: user.id.to_s,
        role: user.role,
        membership_level: level
      }
    )

    { session_id: session.id, url: session.url }
  end

  def self.sync_from_subscription(subscription)
    return if subscription.blank?

    customer_id = subscription.customer.to_s
    user = User.find_by(stripe_customer_id: customer_id)
    return if user.blank?

    profile = profile_for(user)
    return if profile.blank?

    level = level_from_subscription(user: user, subscription: subscription)
    profile.update!(
      membership_level: level,
      stripe_membership_subscription_id: subscription.id,
      membership_status: subscription.status,
      membership_current_period_end_at: timestamp_to_time(subscription.current_period_end)
    )
  end

  def self.cancel_for_basic!(user)
    return if Stripe.api_key.blank?

    profile = profile_for(user)
    return if profile.blank?
    return if profile.stripe_membership_subscription_id.blank?

    Stripe::Subscription.update(
      profile.stripe_membership_subscription_id,
      { cancel_at_period_end: true }
    )
  rescue Stripe::InvalidRequestError
    profile.update!(stripe_membership_subscription_id: nil, membership_status: nil, membership_current_period_end_at: nil)
  rescue Stripe::StripeError => e
    Rails.logger.warn("MembershipSubscriptionService.cancel_for_basic!: Stripe error ignored (#{e.class}: #{e.message})")
  end

  def self.profile_for(user)
    user.company? ? user.company_profile : user.technician_profile
  end

  def self.price_id_for(role:, level:)
    aud = MembershipPolicy.normalize_audience(role)
    cfg = MembershipTierConfig.find_by(audience: aud, slug: level.to_s)
    return cfg.stripe_price_id.to_s if cfg&.stripe_price_id.present?

    PRICE_ENV_KEYS.dig(role.to_s, level.to_s).then { |key| key.present? ? ENV[key].to_s : nil }
  end

  def self.level_from_subscription(user:, subscription:)
    price_id = subscription.items&.data&.first&.price&.id.to_s
    aud = user.company? ? "company" : "technician"
    match = MembershipTierConfig.find_by(audience: aud, stripe_price_id: price_id)
    return match.slug if match

    mapping = PRICE_ENV_KEYS.fetch(user.role.to_s)
    found = mapping.find { |_lvl, env_key| ENV[env_key].to_s == price_id }
    return found.first if found

    MembershipPolicy.default_slug_for(aud)
  end

  def self.timestamp_to_time(ts)
    return nil if ts.blank?

    Time.zone.at(ts.to_i)
  end
end
