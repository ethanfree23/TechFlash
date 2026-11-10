# frozen_string_literal: true

namespace :staging do
  desc "Real Stripe TEST-mode ACH/card E2E against staging (refuses unless Rails.env.staging? + sk_test + Connect)"
  task ach_e2e: :environment do
    require_relative "../staging_ach_e2e_runner"
    StagingAchE2eRunner.new.run!
  end

  desc "Create Express TEST connected account + AccountLink; print id and onboarding URL (no ToS attestation)"
  task connect_onboarding_link: :environment do
    require_relative "../staging_ach_e2e_runner"

    unless Rails.env.staging?
      abort "[connect_onboarding_link] REFUSED: Rails.env must be staging (got #{Rails.env})"
    end
    unless Stripe.api_key.to_s.start_with?("sk_test_")
      abort "[connect_onboarding_link] REFUSED: Stripe secret must be sk_test_ (TEST mode only)"
    end
    if defined?(StripeModeGuard)
      err = StripeModeGuard.error_message
      abort "[connect_onboarding_link] REFUSED: #{err}" if err
    end

    platform = Stripe::Account.retrieve
    platform_id = platform.id.to_s
    expected = StagingAchE2eRunner::EXPECTED_PLATFORM_ID
    # Platform Account.retrieve may expose livemode via hash key; never assume .livemode.
    helper = StagingAchE2eRunner.new
    livemode = helper.send(:safe_stripe_livemode, platform)
    begin
      helper.send(:assert_test_mode_via_platform!, platform)
    rescue StagingAchE2eRunner::Fail => e
      abort "[connect_onboarding_link] REFUSED: #{e.message}"
    end

    puts "[connect_onboarding_link] platform=#{platform_id} livemode=#{livemode.inspect}"
    unless platform_id == expected
      warn "[connect_onboarding_link] WARNING: platform #{platform_id} != expected #{expected}"
    end

    email = "e2e+express-onboard-#{SecureRandom.hex(3)}@techflash.staging"
    # Express: do NOT send tos_acceptance — Stripe collects requirements / hosted onboarding.
    account = Stripe::Account.create(
      type: "express",
      country: "US",
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type: "individual",
      metadata: { techflash_e2e: "onboarding_link" }
    )

    refresh_url = ENV.fetch("STAGING_E2E_CONNECT_REFRESH_URL", "https://example.com/connect/reauth")
    return_url = ENV.fetch("STAGING_E2E_CONNECT_RETURN_URL", "https://example.com/connect/return")
    link = Stripe::AccountLink.create(
      account: account.id,
      refresh_url: refresh_url,
      return_url: return_url,
      type: "account_onboarding"
    )

    puts ""
    puts "==== staging:connect_onboarding_link ===="
    puts "account_id=#{account.id}"
    puts "onboarding_url=#{link.url}"
    puts ""
    puts "Open the onboarding URL in a browser and complete Stripe TEST data."
    puts "After transfers capability is active, re-run E2E with:"
    puts "  STAGING_E2E_CONNECT_ACCOUNT_ID=#{account.id}"
    puts "That account is never deleted by staging:ach_e2e."
  end
end
