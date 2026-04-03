# frozen_string_literal: true

namespace :payments do
  desc 'Add funds to available balance (test mode only). Use before release when 4242 charges are pending.'
  task add_test_balance: :environment do
    amount_cents = (ENV['AMOUNT'] || 800_000).to_i # default $8000 (covers Job #18's $7600)

    if Stripe.api_key.blank?
      puts "ERROR: Stripe not configured (set STRIPE_SECRET_KEY in .env, or STRIPE_SECRET_KEY_TEST as fallback)"
      next
    end

    if Stripe.api_key.start_with?('sk_live_')
      puts "ERROR: This task is for TEST mode only. Do not run with live keys."
      next
    end

    begin
      intent = Stripe::PaymentIntent.create(
        amount: amount_cents,
        currency: 'usd',
        payment_method: 'pm_card_bypassPending',
        payment_method_types: ['card'],
        confirm: true
      )
      puts "Added $#{amount_cents / 100.0} to available balance (PaymentIntent #{intent.id})"
      puts "Run: bundle exec rails payments:release_eligible"
    rescue Stripe::StripeError => e
      puts "ERROR: #{e.message}"
    end
  end

  desc 'Release held payments when eligible (both reviewed OR 72h since job finished)'
  task release_eligible: :environment do
    count = 0
    Job.where(status: :finished).where.not(finished_at: nil).find_each do |job|
      next unless job.payments.held.any?
      next unless PaymentService.release_eligible?(job)

      result = PaymentService.release_to_technician(job.payments.held.first)
      if result[:success]
        count += 1
      else
        puts "Job #{job.id}: release failed - #{result[:error]}"
      end
    end
    puts "Released #{count} payment(s)"
  end

  desc 'Diagnose held payments: check tech Stripe connection, release eligibility, and attempt release'
  task diagnose: :environment do
    held = Payment.held.includes(job: [:company_profile, { job_applications: :technician_profile }])
    puts "=== Held payments: #{held.count} ===\n\n"

    held.each do |payment|
      job = payment.job
      accepted = job.job_applications.find_by(status: :accepted)
      tech_profile = accepted&.technician_profile
      tech_user = tech_profile&.user

      puts "Job ##{job.id} | Amount: $#{payment.amount_cents / 100.0} | Tech: #{tech_user&.email || 'N/A'}"
      puts "  stripe_account_id: #{tech_profile&.stripe_account_id.presence || 'MISSING'}"
      puts "  release_eligible?: #{PaymentService.release_eligible?(job)}"
      puts "  company_reviewed: #{Rating.exists?(job: job, reviewer: job.company_profile)}"
      puts "  tech_reviewed: #{tech_profile ? Rating.exists?(job: job, reviewer: tech_profile) : 'N/A'}"

      if PaymentService.release_eligible?(job)
        puts "  Attempting release..."
        result = PaymentService.release_to_technician(payment)
        if result[:success]
          puts "  => SUCCESS (transferred to tech)"
        else
          puts "  => FAILED: #{result[:error]}"
        end
      end
      puts
    end
  end
end
