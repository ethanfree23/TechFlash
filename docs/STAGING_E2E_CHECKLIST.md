# Coordinator Staging E2E Checklist (Stripe TEST only)

Do **not** run against production. Do **not** use live keys.

Official Stripe test bank values: use current Stripe docs  
(“Test bank account numbers” / Financial Connections test institutions).  
Do not invent routing/account numbers.

## Preconditions

- [ ] 1. Staging uses only Stripe **test** mode (`sk_test_` / `pk_test_`).
- [ ] 2. No staging outbound real-world emails, SMS, Checkr screenings, or GHL leads.
- [ ] 3. Frontend talks only to staging API (`VITE_API_BASE_URL`).

## Bank setup

- [ ] 4. Add a successful Stripe ACH test bank account (Financial Connections).
- [ ] 5. Complete instant **or** microdeposit verification.
- [ ] 6. Verify bank method becomes available and can be set default.

## ACH funding

- [ ] 7. Start an ACH-funded job payment.
- [ ] 8. Verify job stays `pending_funding` while PaymentIntent is `processing`.
- [ ] 9. Trigger successful payment finality (`payment_intent.succeeded`).
- [ ] 10. Verify exactly one successful funding transaction.
- [ ] 11. Trigger a test ACH failure path.
- [ ] 12. Verify no premature job funding or technician transfer.
- [ ] 13. Replay the success webhook.
- [ ] 14. Verify no duplicate transaction.

## Refunds / transfers / risk

- [ ] 15. Create a partial refund in test mode.
- [ ] 16. Verify pending → succeeded refund accounting (never treat pending as failed).
- [ ] 17. Test a Stripe Connect transfer after funded+eligible job.
- [ ] 18. Verify single-charge `source_transaction` mapping when applicable; multi-charge uses platform balance (Option B).
- [ ] 19. Simulate post-success dispute/return via Stripe test mechanisms.
- [ ] 20. Verify financial exposure / investigation flag (`PaymentRiskEvent`).
- [ ] 21. Verify **no** automatic transfer reversal.
- [ ] 22. Verify “Transferred to Stripe account” ≠ “Paid out to bank”.
- [ ] 23. Verify bank payout status shows **unknown** when attribution unproven.
- [ ] 24. Verify Admin → Payments risk visibility (“Review required” / “Payout at risk”).

## Regression

- [ ] 25. One existing card funding flow.
- [ ] 26. One existing subscription flow.
- [ ] 27. One background-check flow in sandbox mode.
- [ ] 28. Review Stripe event delivery logs.
- [ ] 29. Verify no critical backend errors.
- [ ] 30. Record E2E results and outstanding blockers.

## Automated runner

```bash
RAILS_ENV=staging bin/rails staging:ach_e2e
```

Requires Connect-capable `sk_test` platform key. See `skilled_hub_api/lib/staging_ach_e2e_runner.rb`.

Connect transfer destination (scenario 6), TEST mode only:

1. Runner creates a controller account (`requirement_collection=application`, fees/losses on application, `stripe_dashboard.type=none`) with test ToS — never Express + ToS.
2. If create is rejected, set `STAGING_E2E_CONNECT_ACCOUNT_ID=acct_...` (must be on platform `acct_1T9R18Rsck7C7qtp`, livemode false, `transfers=active`; never deleted).
3. To mint an Express account for hosted onboarding:

```bash
RAILS_ENV=staging bin/rails staging:connect_onboarding_link
# complete URL with Stripe TEST data, then:
STAGING_E2E_CONNECT_ACCOUNT_ID=acct_... RAILS_ENV=staging bin/rails staging:ach_e2e
```


### Defects fixed after first staging run (head `a6e39c9`)

| Symptom | Root cause | Fix |
|---|---|---|
| `PG::UndefinedColumn: failed_at` in `signed_webhooks_persisted` | **Runner-only** SQL on `job_payment_transactions.failed_at` (column exists only on `stripe_setup_records`) | Query `status` / `succeeded_at` / `processing_at`; regression in `staging_ach_e2e_runner_test.rb` |
| `PaymentMethods of type us_bank_account must be verified before they can be attached` | Runner attached unverified raw bank PMs | Confirm SetupIntent with official test bank + mandate on **confirm** (not create); microdeposit path when required |
| False “Connect platform OK” | Detection short-circuited (`\|\| true`) / Customer+PI alone | Authoritative `Account.list` + `Account.create` probe; otherwise **BLOCKED** |

### Webhook delivery classes (not equivalent)

1. Stripe genuinely generated and delivered `evt_` to the staging endpoint
2. Stripe CLI / test event forwarded to endpoint
3. Synthetic locally signed fixture (deterministic unit/integration only)

## Classification legend

- Unit/mock: Rails tests with stubs
- Integration: real Stripe test API (optional script / CLI)
- Staging E2E: this checklist / `staging:ach_e2e`
- Synthetic: signed webhook fixtures
