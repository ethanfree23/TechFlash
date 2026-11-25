# TechFlash — Live ACH Controlled-Launch Audit (report only)

**Scope:** Prove production readiness for ONE authorized real ACH collection of $5 using internal company #19.
**Method:** Read-only code audit of `origin/main` @ `f8d2753`. No Stripe API calls, no database access, no configuration changes. The agent environment has no production Stripe key, Railway token, or `DATABASE_URL`; every production-side check below is written as an exact query/Dashboard step for the operator.
**Status:** Documentation only. Nothing in this PR changes runtime behavior.

Related: `ACH_PAYMENTS.md`, `docs/STRIPE_WEBHOOK_EVENT_INVENTORY.md`, `docs/STAGING_E2E_CHECKLIST.md`, `PAYMENTS_SETUP.md`, `CRON_JOBS.md`.

---

## Verdict (summary)

| Question | Answer |
|---|---|
| Can a genuine **$5** payable ACH transaction be produced through an existing supported flow without a fake job, fake wages, or false job history? | **No.** Every code path that creates a `us_bank_account` PaymentIntent is a job-funding path (`initial_job_charge`, `counteroffer_top_up`, `final_hours_top_up`) and requires a real, published `Job`. A $5 job would publish, alert technicians, and be claimable — a manufactured listing. (§2) |
| Is the ACH initiation → webhook → ledger path itself ready for one live collection? | **Conditionally yes.** Idempotency, processing-vs-funded separation, webhook dedup, kill switches, and transfer gating are implemented and fail-closed. Two observability gaps (G-1, G-2) and one Dashboard precondition (live destination lacks `payment_intent.processing`) must be handled by the runbook or a small draft PR. (§1, §4, §5, §7) |
| GO / NO-GO for ONE live collection | **NO-GO for the "$5 via company #19 job" plan as specified.** **CONDITIONAL GO** for one live collection via either (A) one real internal job at its real price, or (B) an isolated, audited, non-payout-eligible internal smoke-test mechanism after design review. Code changes proposed in §10 are small and go in a separate DRAFT PR only if authorized. |

---

## 1. Exact existing paths (file:line evidence)

### 1.1 ACH initiation
| Step | Location | Behavior |
|---|---|---|
| Entry points that can create a company debit | `jobs_controller.rb:213` (create), `:774` (`finalize_publish_funding!` on draft publish), `job_funding_adjustment_service.rb:58` (counteroffer top-up), `job_settlement_service.rb:79` (final-hours top-up, via cron) | All call `JobFundingService.collect!`. No other code path creates a `us_bank_account` PaymentIntent. (`lib/staging_ach_e2e_runner.rb` is staging-only and refuses non-`sk_test` keys.) |
| Amount | `job_funding_service.rb:103-108` | `JobMoney.company_charge_cents(agreed_labor_cents, company_commission_percent_snapshot)` = labor + company commission. Never a free-form amount. |
| Waiver / unpriced bypass | `job_funding_service.rb:81-100` | `job_funding_waived?` companies and unpriced jobs publish without any PaymentIntent. **Company #19 must have `job_funding_waived = false` or no charge will occur.** |
| Payment method selection | `job_funding_service.rb:327-345` (`default_payment_method_id`) | Customer `invoice_settings.default_payment_method` first, then **card before bank**. If company #19 has any card on file and the bank is not the explicit default, the pilot would charge the card, not ACH. |
| ACH gate | `job_funding_service.rb:244-253`, `job_stripe_ops.rb:89-96` | Checked twice before `PaymentIntent.create`: `AchAccess.allowed?(company)` (returns `code: "ach_disabled"`), then `AchAccess.assert_allowed!`. Fail-closed. |
| PaymentIntent params | `job_stripe_ops.rb:98-115` | `off_session: true, confirm: true, payment_method_types: ["us_bank_account"], transfer_group: "TECHFLASH_JOB_#{id}", metadata: {job_id, payment_id, transaction_id, transaction_type, revision}`. `StripeModeGuard` requires `sk_live_` in production (`stripe_mode_guard.rb:64-79`). |

### 1.2 Idempotency
| Mechanism | Location | Notes |
|---|---|---|
| Local key | `job_funding_service.rb:193` | `tf_job_#{job.id}_txn_#{type}_r#{revision}_#{amount}`; unique index `index_job_payment_transactions_on_idempotency_key` (`schema.rb:718`). |
| Row lock + reuse | `job_funding_service.rb:198-230` | Under `Job.lock`, an existing txn with the same key short-circuits: `succeeded` → success; `requires_action` → returns client_secret; `processing` → "already processing". Only `pending`/`failed` rows are reused for a new Stripe call, with the **same** key. |
| Stripe key | `job_stripe_ops.rb:116` | Same string passed as Stripe `Idempotency-Key`; Stripe replays the original PI for ~24 h. |
| Stripe call outside DB txn | `job_funding_service.rb:230-260` | PI creation is not inside a DB transaction; finalize is a second locked transaction (`:357`). |

### 1.3 Processing / success / failure (synchronous)
`finalize_collection!` (`job_funding_service.rb:357-410`) maps Stripe status → txn `succeeded | processing | requires_action | failed`. `fund_for_publish!` (`:109-134`) sets job `pending_funding/adjustment_required` on processing, `pending_funding/funding_failed` on failure; it publishes only on synchronous `succeeded` (card path).

### 1.4 Webhooks
| Concern | Location |
|---|---|
| Signature verification, platform + connect secrets, 500 when secret missing in prod/staging | `stripe_webhooks_controller.rb:26-42, 80-108` |
| Dedup | `:44-60`: `StripeWebhookEvent` unique `stripe_event_id` (`schema.rb:1170`), `processed_at` set only after handler completes; row lock on re-delivery. |
| Connected-account isolation | `:111-115` |
| `payment_intent.processing` → txn processing, job `pending_funding` | `:411-430` (skips if txn already `succeeded/failed/canceled`) |
| `payment_intent.succeeded` → `mark_txn_succeeded!`, Payment `held`, **publish job**, record revision, email, alerts | `:383-409` |
| `payment_intent.payment_failed` → pre-success: txn failed, job `funding_failed`, `PaymentRiskEvent pre_success_failure`; post-success: never downgrades, `investigation_required`, unconfirmed risk event | `:432-494` |
| Txn lookup | `:618-622`: by `stripe_payment_intent_id`, fallback `pi.metadata.transaction_id`. |

### 1.5 Settlement, ledger, returns, risk, transfers
| Concern | Location | Behavior |
|---|---|---|
| Ledger truth | `job_ledger.rb:44-77, 133-136` | Only `status_succeeded` collections count; `fully_funded = (required − net_succeeded) == 0`. `processing` ≠ funded. |
| Settlement | `job_settlement_service.rb:6-22, 76-110` | Only `finished` jobs; may `collect!` a `final_hours_top_up` (new key) or refund. Runs from `PaymentsReleaseRunner` (cron / `POST /api/v1/internal/payments/release_eligible`, `PAYMENTS_CRON_SECRET`). |
| Transfer gates | `payment_service.rb:94-110, 145, 155` | Refuses unless `fully_funded`, no `processing` collection/refund, no blocking risk event, Connect `payout_ready?`, amount ≤ `net_funded_cents`. 23 h transfer idempotency window (`:420-433`); `outcome_unknown` classification for transfers (`job_stripe_ops.rb:347+`). |
| ACH returns | `stripe_webhooks_controller.rb:541-593` | `charge.dispute.*` on a `us_bank_account` collection → confirmed `post_success_return` (blocking). `payment_intent.payment_failed` after success → unconfirmed only. |
| Refund reconciliation | `:518-531, 651-791` | External Dashboard refunds are recorded with `tf_stripe_refund_#{id}` key; app refunds linked by metadata; status follows Stripe. |
| Kill switches | `ach_access.rb` | ENV `ACH_GLOBAL_DISABLED` > PlatformSetting `ach_payments_globally_enabled` (absent → false) > `company_profiles.ach_payments_enabled` (default false, `schema.rb:409`). Audited via `AchFeatureAudit`. |

---

## 2. Can a genuine $5 payable transaction be created via an existing flow?

**No.**

- The only live PaymentIntent creators are job-funding paths (§1.1). Amount is derived from `agreed_labor_cents × (1 + company%)`; there is no free-form amount and no "test charge" endpoint.
- Model validation does not impose a minimum hourly rate (`job.rb:211-226`), so a job like `hourly_rate_cents: 500, hours_per_day: 1, days: 1` is *technically* savable. But publishing it is not a smoke test — it is a real listing:
  - `payment_intent.succeeded` → `JobFundingService.publish!` → `status: open`, `funding_status: funded`, `go_live_at` (`job_funding_service.rb:297-299`; webhook `:399`).
  - `JobAlertDispatcher.dispatch_for_job` notifies every matching technician (`job_alert_dispatcher.rb:4-16`; webhook `:402`).
  - `UserMailer.job_posted_email` / `payment_confirmation_email` are sent; the job is claimable (`effectively_open?`).
  - A `JobFinancialRevision` and `Payment` header are created — permanent job and financial history for a job nobody intends to staff.
- Background-check Checkout and membership subscriptions use different rails (Checkout / Billing), not the saved-bank off-session PaymentIntent path under audit, so they do not prove the ACH funding path.
- Drafts never fund (`jobs_controller.rb:280-290`), and `confirm_funding` only *retrieves* an existing PI (`job_funding_service.rb:147`); neither can originate a $5 debit.

## 3. Smallest legitimate alternative (no validation weakening, no ledger overrides, no fake job)

Ranked by legitimacy and evidentiary value:

| Option | What it proves | Legitimacy | Cost / risk |
|---|---|---|---|
| **A. One real internal job at its real price** (company #19 genuinely needs the work; a real technician may claim it) | Full path: initiation, processing, webhook, ledger, publish, later settlement/transfer | Fully legitimate; true job history | Debit is the real job amount, not $5; the job becomes live inventory. Recommended if the owner actually has a job to post. |
| **B. Isolated internal financial smoke-test mechanism** (new, reviewed before implementation) | Initiation, processing, webhook, dedup, Charge/balance txn, risk/return handling | Legitimate if isolated: no `Job`, no `Payment`, no `transfer_group`, non-payout-eligible, admin-only, audited | Requires a small code change + review. Design constraints below. |
| C. Stripe Dashboard manual $5 ACH payment against company #19's saved bank | Stripe-side ACH + bank mandate validity + webhook signature/dedup (`StripeWebhookEvent` row persists; handler no-ops because no txn matches — `:618-622`) | Legitimate; outside app ledger | Does **not** exercise `collect!`, ledger, or publish. Bypasses `AchAccess`. Useful only as a mandate/bank sanity check, not as production proof. |

**Not acceptable:** a $5 job (§2); lowering any validation; editing `amount_cents`; `simulate_stripe?` in production; `payments:add_test_balance` (test-mode only, `payments.rake:89-98`).

**Option B design constraints (for review, not implementation):**
- Dedicated model (e.g. `InternalFinancialSmokeTest`) with its own idempotency key namespace (`tf_smoke_#{id}`), `metadata.techflash_smoke_test = "true"`, **no** `transfer_group`, **no** `Job`/`Payment` rows.
- Admin-only endpoint; requires explicit owner authorization record (actor, reason, amount cap ≤ $5, company id) and `AchFeatureAudit`-style audit row.
- Same `AchAccess` gate and `StripeModeGuard`; same webhook controller recognizes `techflash_smoke_test` metadata and records outcome on the smoke-test row only.
- Excluded from `JobLedger`, `PaymentService.release_to_technician`, settlement, and all admin "job payments" aggregates; appears only in a dedicated admin view.
- One-shot per authorization; refund of the $5 is a separate, explicitly authorized admin action (never automatic).

---

## 4. Exact checks: Stripe Dashboard and database

Replace `<job_id>`, `<pi_id>`, `<txn_id>` from the operator log. All SQL is read-only.

| Check | Stripe Dashboard | Database (read-only) | Pass criterion |
|---|---|---|---|
| PaymentIntent created **once** | Payments → search `TECHFLASH_JOB_<job_id>` (transfer group) and metadata `job_id=<job_id>`; Developers → Logs → filter `POST /v1/payment_intents` with the idempotency key | `SELECT id, status, idempotency_key, stripe_payment_intent_id, amount_cents FROM job_payment_transactions WHERE job_id=<job_id>;` | Exactly one PI; one txn row; key matches `tf_job_<job_id>_txn_initial_job_charge_r1_<amount>` |
| ACH processing | PI status `Processing`; payment method type `us_bank_account` | Same row: `status=5 (processing)`, `processing_at` set, `payment_method_type='us_bank_account'`; `SELECT status, funding_status FROM jobs WHERE id=<job_id>;` → `pending_funding` / `adjustment_required` | Job **not** open while processing |
| Succeeded / failed webhook | Developers → Webhooks → live platform destination → event `payment_intent.succeeded` (or `payment_failed`) for `<pi_id>` shows 200 | `SELECT stripe_event_id, event_type, processed_at FROM stripe_webhook_events WHERE payload LIKE '%<pi_id>%' ORDER BY created_at;` | One row per event id, `processed_at` non-null |
| Stripe Charge and balance transaction | PI → Charge `py_…`/`ch_…` → Balance transaction: amount 500, fee, `available_on` | `SELECT stripe_charge_id, succeeded_at FROM job_payment_transactions WHERE id=<txn_id>;` | `stripe_charge_id` equals the Dashboard charge id |
| `JobPaymentTransaction` final state | — | Same row: `status=2 (succeeded)`, `succeeded_at`, `revision=1`, `investigation_required=false`, `dispute_status IS NULL` | — |
| `JobLedger` verified funding | — | `bin/rails runner 'p JobLedger.for(Job.find(<job_id>)).to_h'` (read-only) | `net_funded_cents == company_required_cents`, `fully_funded == true`; job `status=open`, `funding_status=funded` after webhook |
| `StripeWebhookEvent` dedup | Webhooks → resend `payment_intent.succeeded` once (Dashboard "Resend") | Row count for that `stripe_event_id` stays 1; txn `succeeded_at` unchanged | Handler returns 200 on the replay (`:44-45`) and makes no second write |
| Zero unauthorized Transfers / Refunds | Connect → Transfers filtered by `transfer_group=TECHFLASH_JOB_<job_id>` → none; PI → Refunds → none | `SELECT COUNT(*) FROM job_payment_transactions WHERE job_id=<job_id> AND transaction_type IN (<transfer/refund enum values>);` → 0; `SELECT COUNT(*) FROM payment_risk_events WHERE stripe_payment_intent_id='<pi_id>';` → 0 | — |
| Mandate / setup evidence | Customers → company #19 customer → Payment methods → bank → Mandate (`mandate_…`) status `active` | `SELECT * FROM stripe_setup_records WHERE user_id=<user_id> AND payment_method_type='us_bank_account' ORDER BY id DESC LIMIT 1;` → `status='succeeded'` | — |

---

## 5. Can an automatic second debit occur when the first outcome is unknown?

**For the initial job charge: no automatic re-debit path exists.** Residual risk is manual re-posting.

Evidence:
1. `collect!` short-circuits on `succeeded`, `requires_action`, and `processing` rows with the same key (`job_funding_service.rb:201-220`).
2. The only triggers of `fund_for_publish!` are job **create** and **publishing a draft** (`jobs_controller.rb:213, 774`). A `pending_funding` job cannot re-trigger funding: `update` funds only when `publishing_draft` (`:280-290, 335-337`); `confirm_funding` only retrieves the PI (`job_funding_service.rb:147`); `unpublish` refunds net funded (0 if nothing succeeded). No "retry payment" endpoint exists (grep: none).
3. A `pending`/`failed` row reused on the same key replays the same Stripe PI for ~24 h (Stripe idempotency). After 24 h a reuse would create a new PI — but see (2): nothing reuses it automatically for `initial_job_charge`.
4. Cron settlement (`PaymentsReleaseRunner` → `settle!`) can `collect!` a `final_hours_top_up` only for `finished` jobs with `amount_due_cents > 0`. Not reachable for an unclaimed pilot job; also subject to the same ACH gate.

**Gaps (observability, not double-debit):**
- **G-1** — `JobStripeOps.create_payment_intent!` rescues every `Stripe::StripeError` as `status: "failed"` (`job_stripe_ops.rb:132-133`), unlike `transfer!`, which classifies connection/rate-limit/5xx/timeouts as `outcome_unknown`. On an ambiguous error the txn is marked `failed` with **no** `stripe_payment_intent_id`, and the job shows `funding_failed` while Stripe may actually be debiting.
- **G-2** — `reconcile_payment_intent_processing` skips `failed` txns (`:415`), so the UI keeps saying "failed" until `payment_intent.succeeded` arrives; the succeeded handler does recover the row via `metadata.transaction_id` (`:620`) and publishes. Self-healing on success, misleading in between.
- **Operational hazard** — a company (or admin) seeing "failed" might create a new job → new `job_id` → new key → **second real debit**. The runbook (§9) forbids re-posting until the Stripe Dashboard shows the first PI's terminal state.

---

## 6. ACH mandate audit

**What exists today**
- Mandate acceptance is collected by Stripe.js (`collectBankAccountForSetup` → `confirmUsBankAccountSetup`) on a SetupIntent with `usage: "off_session"` (`company_payment_methods_service.rb:45-49`, `BankAccountSetupForm.jsx:50-70`). Stripe stores the Mandate object; `mandate_data` is deliberately not sent server-side (`:60-62`). Only `request_ip_present` / `user_agent_present` booleans are kept in SetupIntent metadata.
- App-side disclosure: *"By connecting, you authorize TechFlash to debit this account for job funding, counteroffer adjustments, and settlement top-ups under your saved payment method mandate."* (`BankAccountSetupForm.jsx:165-168`); *"Priced jobs are charged when you post them … bank (ACH) debits can take 1–5 business days — jobs stay unpublished until the debit succeeds."* (`CompanyPaymentMethodsPanel.jsx:170-171`); decision flag 4 in `ACH_PAYMENTS.md`.
- `PaymentTermsPage.jsx` has no ACH/bank-specific section (only generic disputes/chargebacks).
- `stripe_setup_records` stores setup-intent id, pm id, type, status (`schema.rb:1145-1160`) — **no mandate id, no accepted-text version, no IP/UA/timestamp**.

**Coverage for the pilot (one-time job funding):** adequate. The pilot debit is "job funding" at posting, which is exactly what the on-screen text and Stripe's standard off-session ACH Direct Debit mandate cover. Counteroffer/settlement top-ups are also named.

**What P3 (rolling two-week, variable recurring debits) needs separately — not covered today:**
1. Explicit **variable recurring debit** language: frequency (every two weeks), that amounts vary with approved hours, and how the amount is determined.
2. Nacha-style **advance notice of variable amounts** (or an agreed range) before each cycle debit, plus immediate top-up disclosure (D-4).
3. Clear **revocation** method and lead time; what happens to work authorization when revoked (ties to `Funding::WorkAuthorization`).
4. **Evidence retention**: persist Stripe `mandate_id`, accepted text version/hash, IP, user agent, timestamp on `stripe_setup_records` (or a `payment_mandate_acceptances` table); re-acceptance flow when mandate text changes.
5. Payment Terms page section for ACH debits (one-time and recurring), returns (R01/R10 etc.), and TechFlash's return-handling policy.
6. Counsel review of items 1–5 (already tracked as open §18 questions in `ROLLING_TWO_WEEK_FUNDING_ARCHITECTURE.md`).

---

## 7. Kill switches, webhooks while disabled, admin observability

| Item | Evidence | Result |
|---|---|---|
| Global ENV kill | `AchAccess.env_kill_switch?` (`ACH_GLOBAL_DISABLED`) overrides everything | Verified fail-closed |
| Global setting | `PlatformSetting ach_payments_globally_enabled`; absent/invalid → false; `set_global!` audited | Verified |
| Company flag | `company_profiles.ach_payments_enabled` default false; `set_company!` audited (`update_column`) | Verified |
| Gating points | New bank SetupIntent (`company_payment_methods_service.rb:40-42`), set default bank (`:95-97`), every new debit (`job_funding_service.rb:244-253`, `job_stripe_ops.rb:89-96`) | Verified — including retries and top-ups |
| Webhooks while disabled | `StripeWebhooksController` never consults `AchAccess`; an in-flight PI still reconciles after a kill (per `ach_access.rb` contract) | Verified: disabling ACH mid-flight does not strand the first debit |
| Admin observability | `GET /api/v1/admin/ach_settings` (flags + 25 audits), `/audits`, `/monitoring` (ACH by status, returned/disputed, open/blocking risk events, transfers `outcome_unknown`, pending-funding > N days) — `admin/ach_settings_controller.rb:11-112`; UI `SystemControlsAchFlags.jsx`; `admin/job_payments_controller.rb` show/resolve/reconcile | Verified |
| Gap G-3 | `/monitoring` has no row for "txn `failed` with blank `stripe_payment_intent_id`" (the G-1 signature) | Add to runbook query; optional small change |

---

## 8. Production flags and record IDs to collect (record only — do not change)

**Identity check first.** Internal store notes show HSI = `CompanyProfile 8 / user 19`. Confirm "company #19" means `company_profiles.id = 19` (TechFlash internal) and **not** user 19 before anything else:
`SELECT cp.id, cp.company_name, cp.user_id, u.email, cp.ach_payments_enabled, cp.job_funding_waived, u.stripe_customer_id FROM company_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.id=19;`

| Flag / record | Where | Expected for pilot |
|---|---|---|
| `ACH_GLOBAL_DISABLED` | Railway production ENV | unset / not `true` (currently expected to be in whatever state the owner left; record it) |
| `PlatformSetting 'ach_payments_globally_enabled'` | `SELECT value_json FROM platform_settings WHERE key='ach_payments_globally_enabled';` | currently false; set true **only** at authorization step by owner via admin UI (audited) |
| `company_profiles.ach_payments_enabled` (id 19) | above query | false now; true only at authorization step |
| `company_profiles.job_funding_waived` (id 19) | above query | **must be false** (otherwise no debit occurs) |
| `users.stripe_customer_id` (company #19 user) | above query / Stripe Customers | `cus_…` present |
| Saved bank PM and default | Stripe Customer → `invoice_settings.default_payment_method` = `pm_…` of type `us_bank_account`; Mandate `active` | Bank must be the explicit default **or** no card may be on file (§1.1 selection order) |
| `stripe_setup_records` for that user | `... WHERE user_id=<uid> ORDER BY id DESC;` | latest `us_bank_account` row `status='succeeded'` |
| Commission snapshot source | `MembershipPolicy.company_commission_percent(company)` → tier config | Record the % so the expected charge can be pre-computed |
| Live platform webhook destination | Dashboard → Developers → Webhooks → `we_…`; subscribed events | Today: lacks `payment_intent.processing`, `refund.*`, `charge.dispute.*`, `setup_intent.*` (`STRIPE_WEBHOOK_EVENT_INVENTORY.md` "ADDITIVE changes"). **Precondition:** add at least `payment_intent.processing` and `charge.dispute.*` before the pilot (Dashboard-only, additive; coordinator-approved). |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` | Railway ENV presence only (never print values) | present |
| `STRIPE_SECRET_KEY` mode | `StripeModeGuard.mode_label` via `bin/rails payments:preflight` (read-only) | `live` |
| Cron | Railway cron for `payments:release_eligible` and `PAYMENTS_CRON_SECRET` | Record whether configured; irrelevant to an unclaimed pilot job but must be known |
| Existing ACH rows | `SELECT COUNT(*) FROM job_payment_transactions WHERE payment_method_type='us_bank_account';` | Expected 0 in production today |

---

## 9. Operator runbook (one live collection)

**Before (T-1 day)**
1. Resolve the §8 identity check; record all §8 values in the pilot log.
2. Run `JOB_ID=` *(none)* `COMPANY_EMAIL=<company19 email> LABOR_CENTS=<planned labor> bin/rails payments:preflight` on the production shell (read-only). Blockers must be empty.
3. Confirm Stripe live webhook destination includes `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.*`. Additive Dashboard change only.
4. Confirm `/api/v1/admin/ach_settings/monitoring` baseline: `ach_by_status` all 0, `open_risk_events` 0.
5. Decide the vehicle: Option A (real job at real price) or Option B (reviewed smoke-test mechanism). **Do not proceed with a $5 job.**

**Authorization (owner, written)**
6. Owner message states: company id, vehicle, exact expected amount (`labor × (1 + company%)`), and "one collection only".
7. Admin flips `ach_payments_globally_enabled = true` then company #19 `ach_payments_enabled = true` via System Controls (both audited). Verify `effective_ach_payments_enabled: true` on `GET /admin/ach_settings`.

**Initiation**
8. Company #19 posts the job (Option A) or admin triggers the smoke test (Option B). Expect HTTP 202 `payment_processing: true` and txn `processing` with `pi_…` set. Record `job_id`, `txn_id`, `pi_id`.
9. Immediately after: `SELECT COUNT(*) FROM job_payment_transactions WHERE job_id=<job_id>;` → 1. If the response was an error **and** no `pi_…` is recorded (G-1), check Stripe Dashboard → Payments for a PI with `metadata.job_id=<job_id>` **before any other action**. Never re-post.

**Processing (1–5 business days)**
10. Daily: Stripe PI status; `stripe_webhook_events` rows for `<pi_id>`; job stays `pending_funding`. No manual status edits.
11. Optionally flip company #19 `ach_payments_enabled = false` right after initiation — the webhook path is ungated, so settlement of the first debit is unaffected while no new debit can start.

**Success**
12. On `payment_intent.succeeded`: run every §4 check. Confirm job `open/funded`, `fully_funded == true`, no transfers, no refunds, no risk events.
13. Resend the succeeded event once from the Dashboard to prove dedup (§4 row).

**Reconciliation**
14. Compare Stripe balance transaction (gross 500 or actual, fee, net) to the txn; record `available_on`. Watch `charge.dispute.*` for the return window (ACH returns can arrive days later); any dispute must show as a blocking `post_success_return` risk event.
15. Reset flags to false (audited) unless the owner explicitly authorizes continued ACH use. File the pilot log with event ids.

**Emergency shutdown**
16. Fastest: set Railway ENV `ACH_GLOBAL_DISABLED=true` (redeploy/restart) — blocks all new debits immediately; webhooks and reconciliation keep working. Then set the PlatformSetting and company flag false via admin UI for the audit trail.
17. Do **not** cancel or refund the in-flight PI from the Dashboard without owner authorization; if a refund is authorized, use the app refund path (admin) so the ledger records it, and expect `refund.*` webhooks.
18. If a second PI is ever observed for the same job: stop, record both ids, open a `PaymentRiskEvent` manually via admin, and escalate before any refund.

---

## 10. GO / NO-GO and proposed code changes

**NO-GO** for the plan as literally specified ($5 collection through an existing flow with company #19): the only existing flows would require manufacturing a $5 job listing, which the architect's constraints forbid.

**CONDITIONAL GO** for ONE live ACH collection, provided:
1. Vehicle is Option A (real job, real price) or an approved Option B mechanism (§3) — owner decides.
2. Live webhook destination gains `payment_intent.processing` and `charge.dispute.*` (additive, Dashboard).
3. §8 identity and payment-method-default checks pass (bank is the Stripe default; `job_funding_waived=false`).
4. Runbook §9 step 9 rule ("never re-post until Dashboard confirms") is acknowledged by the operator, because of G-1/G-2.

**Proposed code changes (small, separate DRAFT PR — only if authorized; not required for GO if the runbook is followed):**
- **C-1** `JobStripeOps.create_payment_intent!`: classify `Stripe::APIConnectionError`, `RateLimitError`, 5xx and timeouts as `outcome_unknown` (reuse `classify_transfer_error` logic); `finalize_collection!` persists `outcome_unknown` instead of `failed` and raises a `PaymentRiskEvent` so admin sees it. Tests: timeout → txn `outcome_unknown`, job `pending_funding`, no second PI on immediate retry.
- **C-2** `reconcile_payment_intent_processing`: when the matched txn is `failed`/`outcome_unknown` with blank `stripe_payment_intent_id` and matched via `metadata.transaction_id`, record the PI id and move to `processing` with an `investigation_required` note (never from `succeeded`/`canceled`). Test: ambiguous create then processing webhook → processing, one PI.
- **C-3** (optional) `/admin/ach_settings/monitoring`: add `collections_failed_without_pi` count (G-3).
- **C-4** (only if Option B chosen) the isolated smoke-test mechanism per §3 constraints, after design review.

**Not changed, not proposed:** validation minimums, ledger amounts, payout rules, mandate text (P3 scope), production flags.
