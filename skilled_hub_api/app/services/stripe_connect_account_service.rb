# frozen_string_literal: true

class StripeConnectAccountService
  def self.sync!(technician_profile)
    return technician_profile if technician_profile.blank?
    return technician_profile if technician_profile.stripe_account_id.blank?
    return technician_profile if Stripe.api_key.blank?

    if defined?(DemoMode) && DemoMode.enabled?
      technician_profile.update!(
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_details_submitted: true,
        stripe_transfers_capability_status: "active",
        stripe_connect_requirements_due: {},
        stripe_connect_synced_at: Time.current
      )
      return technician_profile
    end

    account = Stripe::Account.retrieve(technician_profile.stripe_account_id)
    transfers = account.capabilities&.transfers.to_s
    technician_profile.update!(
      stripe_charges_enabled: !!account.charges_enabled,
      stripe_payouts_enabled: !!account.payouts_enabled,
      stripe_details_submitted: !!account.details_submitted,
      stripe_transfers_capability_status: transfers.presence,
      stripe_connect_requirements_due: Array(account.requirements&.currently_due),
      stripe_connect_synced_at: Time.current
    )
    technician_profile
  rescue Stripe::StripeError => e
    Rails.logger.warn("[stripe connect] sync failed profile=#{technician_profile.id}: #{e.message}")
    technician_profile
  end

  def self.payout_ready?(technician_profile, sync: false)
    return false if technician_profile.blank?
    return true if defined?(DemoMode) && DemoMode.enabled? && technician_profile.stripe_account_id.present?
    return false if technician_profile.stripe_account_id.blank?

    if sync && (technician_profile.stripe_connect_synced_at.blank? || technician_profile.stripe_connect_synced_at < 15.minutes.ago)
      sync!(technician_profile)
    end

    technician_profile.stripe_charges_enabled? &&
      technician_profile.stripe_payouts_enabled? &&
      technician_profile.stripe_transfers_capability_status.to_s == "active"
  end
end
