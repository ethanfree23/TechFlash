# frozen_string_literal: true

# Admin-only, one-shot, isolated ACH production smoke test (never a job payment).
#
#   payments:smoke_test:authorize  COMPANY_PROFILE_ID=19 OPERATOR_EMAIL=admin@… AUTHORIZATION_REF=… \
#                                  AUTHORIZED_AT=2026-11-13T15:00:00Z REASON="…" AMOUNT_CENTS=500 PAYMENT_METHOD_ID=pm_…
#   payments:smoke_test:execute    SMOKE_TEST_ID=ifst_… OPERATOR_EMAIL=admin@…            (dry run)
#   payments:smoke_test:execute    SMOKE_TEST_ID=ifst_… OPERATOR_EMAIL=admin@… LIVE_EXECUTE=1   (ONE real debit)
#   payments:smoke_test:status     SMOKE_TEST_ID=ifst_…
#   payments:smoke_test:reconcile  SMOKE_TEST_ID=ifst_…
#
# Requires INTERNAL_SMOKE_TEST_COMPANY_PROFILE_ID to equal COMPANY_PROFILE_ID in the environment.
namespace :payments do
  namespace :smoke_test do
    def smoke_test_env!(key)
      value = ENV[key].to_s.strip
      abort "[payments:smoke_test] #{key} is required" if value.blank?
      value
    end

    def smoke_test_find!
      InternalFinancialSmokeTest.find_by!(public_id: smoke_test_env!("SMOKE_TEST_ID"))
    rescue ActiveRecord::RecordNotFound
      abort "[payments:smoke_test] no smoke test with SMOKE_TEST_ID=#{ENV['SMOKE_TEST_ID']}"
    end

    def smoke_test_print(test)
      puts "  public_id:                #{test.public_id}"
      puts "  company_profile_id:       #{test.company_profile_id}"
      puts "  operator:                 #{test.operator_email} (user #{test.operator_user_id})"
      puts "  authorization_reference:  #{test.authorization_reference} @ #{test.authorized_at&.iso8601}"
      puts "  amount:                   #{test.amount_cents} #{test.currency}"
      puts "  customer / payment method: #{test.stripe_customer_id} / #{test.stripe_payment_method_id}"
      puts "  idempotency_key:          #{test.idempotency_key}"
      puts "  status / reconciliation:  #{test.status} / #{test.reconciliation_status}"
      puts "  payment_intent / charge:  #{test.stripe_payment_intent_id || '-'} / #{test.stripe_charge_id || '-'}"
      puts "  dispute:                  #{test.stripe_dispute_id || '-'} #{test.dispute_status}"
      puts "  first/last attempted:     #{test.first_attempted_at&.iso8601 || '-'} / #{test.last_attempted_at&.iso8601 || '-'}"
      puts "  webhook events:           #{Array(test.webhook_event_ids).join(', ').presence || '-'}"
      puts "  error:                    #{test.error_message}" if test.error_message.present?
      puts "  history:"
      Array(test.history_json).each { |h| puts "    - #{h.to_json}" }
    end

    desc "Record a single-use owner authorization for an internal ACH smoke test (no Stripe write)"
    task authorize: :environment do
      test = InternalFinancialSmokeTestService.authorize!(
        company_profile_id: smoke_test_env!("COMPANY_PROFILE_ID"),
        operator: smoke_test_env!("OPERATOR_EMAIL"),
        authorization_reference: smoke_test_env!("AUTHORIZATION_REF"),
        authorized_at: smoke_test_env!("AUTHORIZED_AT"),
        reason: smoke_test_env!("REASON"),
        amount_cents: smoke_test_env!("AMOUNT_CENTS"),
        payment_method_id: smoke_test_env!("PAYMENT_METHOD_ID"),
        customer_id: ENV["CUSTOMER_ID"].presence
      )
      puts "[payments:smoke_test] authorized (no Stripe write performed)"
      smoke_test_print(test)
    rescue InternalFinancialSmokeTestService::Error, ActiveRecord::RecordInvalid => e
      abort "[payments:smoke_test] REFUSED: #{e.message}"
    end

    desc "Execute an authorized smoke test. Dry run unless LIVE_EXECUTE=1 (exactly one debit, same key)"
    task execute: :environment do
      test = smoke_test_find!
      live = ENV["LIVE_EXECUTE"].to_s.strip == "1"
      puts "[payments:smoke_test] mode=#{live ? 'LIVE_EXECUTE' : 'DRY-RUN'} env=#{Rails.env} stripe=#{StripeModeGuard.mode_label}"
      outcome = InternalFinancialSmokeTestService.execute!(test, operator: smoke_test_env!("OPERATOR_EMAIL"), live_execute: live)
      puts "[payments:smoke_test] #{outcome.status}: #{outcome.message}"
      smoke_test_print(outcome.smoke_test.reload)
    rescue InternalFinancialSmokeTestService::Error, StripeModeGuard::Error, ActiveRecord::RecordInvalid => e
      abort "[payments:smoke_test] REFUSED: #{e.message}"
    end

    desc "Show a smoke test record"
    task status: :environment do
      smoke_test_print(smoke_test_find!)
    end

    desc "Reconcile a smoke test against Stripe (read-only Stripe calls; never creates a new attempt)"
    task reconcile: :environment do
      outcome = InternalFinancialSmokeTestService.reconcile!(smoke_test_find!)
      puts "[payments:smoke_test] #{outcome.status}: #{outcome.message}"
      smoke_test_print(outcome.smoke_test.reload)
    end
  end
end
