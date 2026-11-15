# ACH Direct Debit — Architecture & Decisions

## Current payment lifecycle (unchanged for cards)

1. Company saves a payment method in Settings (SetupIntent).
2. **Pay-to-post**: posting a priced job creates an off-session PaymentIntent and captures immediately.
3. Success → job `open` + `funding_status: funded`. 3DS → `pending_funding` until confirmed.
4. **Claim does not charge.** Technician payouts are Connect Transfers after both reviews **or** 72 hours, only when the ledger is fully funded with **succeeded** collections.

Platform fees come from Admin `MembershipTierConfig` snapshots — never hardcoded.

## ACH incompatibility with “immediate auth”

ACH Direct Debit is asynchronous. Stripe accepts a debit request (`payment_intent.processing`) days before funds settle (`payment_intent.succeeded`). Treating `processing` as collected would:

- List unfunded jobs
- Allow technician payouts against unsettled money
- Create return/NSF exposure after payout

## Approved ACH approach (implemented)

| Stage | Behavior |
|---|---|
| Connect bank | Stripe Financial Connections via SetupIntent (`us_bank_account`), automatic verification with microdeposit fallback |
| Mandate | Stripe SetupIntent / PaymentMethod mandate for future off-session debits |
| Post job (ACH default) | PaymentIntent created; on `processing`, job stays **`pending_funding`** / `adjustment_required` (same unpublished gate as 3DS) |
| ACH succeeds | Webhook `payment_intent.succeeded` publishes the job |
| ACH fails / returns | Webhook marks txn failed; job stays unpublished / adjustment required |
| Ledger / payouts | Only **succeeded** collections count as funded; processing ACH never unlocks Connect transfers |
| Cards | Unchanged immediate capture + 3DS path |

**Business rule (safe default):** ACH-funded jobs are **not** listed until the debit succeeds. This can take 1–5 business days. Cards remain immediate.

## Decision flags (product approval)

These are implemented with the safe defaults above. Changing them needs explicit product/finance approval:

1. **Publish-on-processing?** Rejected by default — would list jobs before funds clear.
2. **Pay technicians while ACH is processing?** Rejected — ledger and release guards require succeeded collections.
3. **Allow ACH for settlement top-ups / counteroffer deltas?** Allowed, but blocks settlement/fill until the ACH PI succeeds (same as 3DS).
4. **Mandate scope:** SetupIntent usage `off_session` for saved methods used for job funding charges. Companies must understand Settings copy: saved banks may be debited for posted jobs, counteroffer deltas, and settlement top-ups under TechFlash’s pay-to-post model.

## What is stored locally

Stripe PaymentMethod / PaymentIntent / Charge / Dispute IDs plus non-sensitive display fields (`payment_method_type`, bank name, last4, brand). **Never** raw account numbers, routing numbers, or bank login credentials.

## Stage 2 additions

- SetupIntent create **must not** include `mandate_data` (mandate via Stripe.js confirm).
- `StripeSetupRecord` reconciles setup success/failure webhooks.
- Refund Stripe status `pending` stays ledger `pending` (never auto-failed).
- `PaymentRiskEvent` tracks post-success disputes/returns/investigation without auto clawback.
- Single-charge Connect transfers may set `source_transaction` (Charge ID). Multi-charge jobs use platform-balance transfers (Option B).
- Staging (`RAILS_ENV=staging`) uses real Stripe **test** keys; DemoMode disabled; outbound comms sandboxed.
- Docs: `docs/STRIPE_WEBHOOK_EVENT_INVENTORY.md`, `docs/STAGING_SETUP.md`, `docs/STAGING_E2E_CHECKLIST.md`.

## Final hardening before controlled live validation (PR: ACH payment hardening + $5 pilot)

- **PaymentIntent outcome classification** (`JobStripeOps.create_payment_intent!`):
  - *Definitive failure* = authoritative Stripe rejection: `Stripe::CardError`, `InvalidRequestError`, `AuthenticationError`, `PermissionError`, or any other `StripeError` with HTTP 4xx. Transaction → `failed`.
  - *Outcome unknown* = `APIConnectionError`, `RateLimitError`, `IdempotencyError` / `code=idempotency_error`, HTTP ≥ 500, transport errors (`Timeout`, `Errno::*`, `OpenSSL::SSL::SSLError`, `Net::*`), or an unclassifiable error. Transaction → `outcome_unknown`; job → `pending_funding` / `adjustment_required`; API returns **202** `payment_outcome_unknown`.
- **Attempt identity**: `job_payment_transactions.collection_first_attempted_at` is stamped before the Stripe call; the idempotency key is never regenerated for the same `(job, type, revision, amount)`.
- **No second debit while unknown**: `JobFundingService.collect!` reconciles unresolved attempts (`CollectionOutcomeReconciler`) before any create; the row lock re-check refuses a new create unless the reconciler returned `retry_same_key_allowed` (stored-PI retrieve or complete metadata search → not found, **and** within `SAFE_RETRY_WINDOW` = 23h). `lookup_failed` or a capped/incomplete search is never treated as "no PI".
- **Beyond the window**: `requires_admin_review`; `POST /api/v1/admin/job_payments/:id/reconcile_collection` (`mark_failed=true`, `reason` required) closes it as failed with an audited `admin_closed_as_failed` record. Never marks unknown as funded.
- **Webhooks** (`payment_intent.processing|succeeded|payment_failed`): livemode must match the environment; ownership is verified against amount, currency, customer, and `metadata.transaction_id/job_id/payment_id`; mismatches are recorded (`webhook_mismatch`) and not applied. `succeeded` is never downgraded; `failed`/`outcome_unknown` recover to `processing` only on a PI whose status is `processing`; `payment_failed` is definitive only for `requires_payment_method`/`canceled`.
- **Payouts**: `PaymentService.release_to_technician` refuses while any collection is `processing`, `outcome_unknown`, or pending-with-attempt.
- **Monitoring**: `GET /api/v1/admin/ach_settings/monitoring` → `unknown_payments` (counts, oldest age, pending vs requires_admin, duplicate in-flight attempts, failed-without-PI, smoke-test summary).
- **Pilot gating** (`AchAccess`, PlatformSetting `ach_pilot_mode` `{enabled, company_profile_ids}`, audited as `AchFeatureAudit scope=pilot`, admin `PATCH /api/v1/admin/ach_settings/pilot`): global OFF or ENV kill → everyone denied; global ON + pilot ON → only allow-listed companies that are not admin-blocked; global ON + pilot OFF → all companies except explicit admin blocks. Pilot ON with no valid company denies everyone (fail closed); `set_pilot!` refuses to enable without an existing company. `AchAccess.allowed?` is the single decision for bank linking, saved-method selection, job funding/top-ups and the smoke test; webhooks, refunds, returns, disputes and reconciliation are never gated.
- **Webhook livemode**: after signature verification the event's `livemode` must be the exact boolean for the environment (production `true`, everything else `false`); `nil`, missing, strings, integers or the opposite boolean are rejected with 400 before any mutation and never marked processed.
- **Smoke-test execution** is an atomic compare-and-set claim (`status authorized → outcome_unknown`, `first/last_attempted_at`) committed in its own transaction before `Stripe::PaymentIntent.create`; no DB lock is held across the network call; concurrent/repeated executes are refused. Execution also verifies the authorizing administrator's identity, Customer/PaymentMethod ownership, an ACTIVE `us_bank_account` Stripe Mandate from a succeeded SetupIntent, amount ≤ 500 cents, `usd`, and the smoke-test metadata marker.
- **Isolated $5 ACH smoke test**: `InternalFinancialSmokeTest` (max 500 cents) executed via `rake payments:smoke_test:*` with an independent `LIVE_EXECUTE=1` gate. Not a Job / Payment / JobPaymentTransaction; no `transfer_group`; metadata `techflash_internal_smoke_test=true`; webhooks routed to `InternalFinancialSmokeTestService.handle_webhook_event!` before any job handler. Authorized payer is `INTERNAL_SMOKE_TEST_COMPANY_PROFILE_ID` (company #19 in production). See `docs/ACH_LIVE_PILOT_AUDIT.md` (PR #36) for the pilot runbook.
