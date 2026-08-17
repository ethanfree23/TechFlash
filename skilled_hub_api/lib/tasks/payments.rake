# frozen_string_literal: true

namespace :payments do
  desc "Release settled, eligible job payouts (reviews or 72h). Idempotent."
  task release_eligible: :environment do
    result = PaymentsReleaseRunner.call
    puts "Released #{result[:released]} payment(s)"
    result[:failed].each { |row| puts "Job #{row[:job_id]}: FAILED #{row[:error]}" }
    result[:skipped].each { |row| puts "Job #{row[:job_id]}: skipped #{row[:reason]}" if ENV["VERBOSE"] }
  end

  desc "Diagnose job funding, Connect, membership, and payout inconsistencies"
  task diagnose: :environment do
    puts "=== Job financial diagnostics ==="
    Job.find_each do |job|
      next unless job.priced? || job.payments.any?

      ledger = JobLedger.for(job)
      issues = []
      issues << "underfunded completed job" if job.finished? && !ledger.fully_funded
      issues << "excess funding" if ledger.amount_refundable_cents.positive? && job.finished?
      issues << "held eligible for payout" if job.finished? && ledger.fully_funded && ledger.transferred_cents.zero? && JobSettlementService.release_eligible?(job)
      issues << "missing snapshots" if job.funding_funded? && job.company_commission_percent_snapshot.blank?
      issues << "unknown company tier" if job.company_membership_tier_config_id.present? && MembershipTierConfig.find_by(id: job.company_membership_tier_config_id).blank?
      next if issues.empty?

      puts "Job ##{job.id} #{job.title.inspect} status=#{job.status} funding=#{job.funding_status} settlement=#{job.settlement_status}"
      puts "  required=#{ledger.company_required_cents} net=#{ledger.net_funded_cents} due=#{ledger.amount_due_cents} transferred=#{ledger.transferred_cents}"
      puts "  issues: #{issues.join(', ')}"
    end

    puts "\n=== Connect accounts ==="
    TechnicianProfile.where.not(stripe_account_id: nil).find_each do |profile|
      ready = StripeConnectAccountService.payout_ready?(profile)
      next if ready

      puts "Tech ##{profile.id} #{profile.user&.email} acct=#{profile.stripe_account_id} payout_ready=#{ready} charges=#{profile.stripe_charges_enabled} payouts=#{profile.stripe_payouts_enabled} transfers=#{profile.stripe_transfers_capability_status}"
    end

    puts "\n=== Membership Stripe prices ==="
    MembershipTierConfig.where("monthly_fee_cents > 0").find_each do |cfg|
      next if cfg.stripe_price_id.present?

      puts "Missing Stripe price: #{cfg.audience}/#{cfg.slug} fee=#{cfg.monthly_fee_cents}"
    end

    puts "\n=== Paid members without subscription IDs ==="
    [CompanyProfile, TechnicianProfile].each do |klass|
      klass.find_each do |profile|
        audience = klass == CompanyProfile ? :company : :technician
        fee = MembershipPolicy.rules_for_audience(audience)[profile.membership_level]
        next unless fee && fee[:fee_cents].to_i.positive?
        next if profile.membership_fee_waived?
        next if profile.stripe_membership_subscription_id.present?

        puts "#{klass.name} ##{profile.id} user=#{profile.user&.email} tier=#{profile.membership_level} missing subscription"
      end
    end
  end

  desc "Add funds to available balance (test mode only)"
  task add_test_balance: :environment do
    amount_cents = (ENV["AMOUNT"] || 800_000).to_i
    if Stripe.api_key.blank?
      puts "ERROR: Stripe not configured"
      next
    end
    if Stripe.api_key.start_with?("sk_live_")
      puts "ERROR: This task is for TEST mode only."
      next
    end
    intent = Stripe::PaymentIntent.create(
      amount: amount_cents,
      currency: "usd",
      payment_method: "pm_card_bypassPending",
      payment_method_types: ["card"],
      confirm: true
    )
    puts "Added $#{amount_cents / 100.0} (PaymentIntent #{intent.id})"
  rescue Stripe::StripeError => e
    puts "ERROR: #{e.message}"
  end
end
