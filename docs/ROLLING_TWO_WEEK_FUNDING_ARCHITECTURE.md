# Rolling Two-Week Job Funding (P3) — Architecture Proposal

**Status:** DRAFT, revision 3 (final review corrections) — design and documentation only. No application code, migrations, schema, scheduler, worker, payment-service, frontend, Stripe, Railway/Vercel, or production-data changes accompany this document.

**Base:** `origin/main` @ `f8d2753` (P2, PR #32 "Separate posting exemption from cash funding_status", is **merged**; `jobs.posted_under_funding_waiver` exists on `main`). Code references are to that commit.

**Revision 3 changes (final architect review of rev 2 @ `f532857`, plus owner correction on D-13):** no fictional funding — requirement adjustments, verified cash allocations and platform-backed funding are distinct and only verified cash makes a period funded (§6.2); labor-available transfer limits — transfers are bounded by the labor portion of verified allocated cash after prior transfers, holds and platform-balance reservations, never by Stripe's raw balance (§12.4); whole-job work authorization requires verified succeeded funding or the zero-requirement exception — processing/failed never authorizes (§7.4); D-13 recorded as **open / not approved** with nothing reserve-related designed as enabled (§12.6, §20).

**Revision 2 changes (architect review of rev 1 @ `0448080`, plus owner decisions):** period-aware payout/settlement policy for rolling jobs (§12); work authorization enforced at every entry point and never implied by dates (§7.4); dedicated Railway cron service, lease-expiry reconciliation and collection reconciliation rules (§8); allocation-based period funding (§6); cancel vs. processing-debit handling (§10.5); HSI legacy jobs require a funding/work decision before new work (§13); enforcement deployed before any rolling-funded job is activated (§17, §19); company #19 pilot described as bank-linking only (§13.1); all D-1…D-12 decisions recorded as approved (§20).

**Companion documents:**

- `docs/ROLLING_FUNDING_STATE_MACHINE.md` — five state concepts, transition tables, outbox and period state machines, work-authorization predicate.
- `docs/ROLLING_FUNDING_TEST_MATRIX.md` — tests each implementation PR must ship.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Current code audit](#2-current-code-audit)
3. [Approved business requirements](#3-approved-business-requirements)
4. [Recommended architecture](#4-recommended-architecture)
5. [Two-week funding calculation](#5-two-week-funding-calculation)
6. [Funding-period data model and allocation](#6-funding-period-data-model-and-allocation)
7. [Posting, claim, start and work-authorization state machines](#7-posting-claim-start-and-work-authorization-state-machines)
8. [Durable scheduler recommendation](#8-durable-scheduler-recommendation)
9. [Card vs ACH lead times](#9-card-vs-ach-lead-times)
10. [Automatic replenishment, true-ups, cancellation](#10-automatic-replenishment-true-ups-cancellation)
11. [Pause / resume](#11-pause--resume)
12. [Funding coverage, technician entitlement and transfer eligibility](#12-funding-coverage-technician-entitlement-and-transfer-eligibility)
13. [HSI / waiver compatibility and legacy migration](#13-hsi--waiver-compatibility-and-legacy-migration)
14. [API, frontend and admin changes](#14-api-frontend-and-admin-changes)
15. [Minimum data model](#15-minimum-data-model)
16. [Test matrix (summary)](#16-test-matrix-summary)
17. [Rollout phases and feature flags](#17-rollout-phases-and-feature-flags)
18. [Legal and financial risks](#18-legal-and-financial-risks)
19. [PR sequence](#19-pr-sequence)
20. [Decisions](#20-decisions)

---

## 1. Executive summary

TechFlash today funds a job **once, in full, at publish time** (`JobFundingService.fund_for_publish!` charges `Job#company_charge_cents` for the whole schedule). The owner has approved moving to **rolling two-week funding**: a normal posting funds only the first two weeks of scheduled work, each later two-week period is funded in advance with lead time, funding failure pauses the job (never erasing compensation for hours already worked), and admin "posting exemptions" allow publication only — never work authorization, never a waiver of payment, never an automatic debit.

This proposal recommends:

- **Period model.** `job_funding_periods` splits the working schedule (via `Schedule::WorkingIntervalExpander`) into consecutive 14-calendar-day windows anchored at the job's effective `scheduled_start_at` in `job_timezone`, recalculated on claim. Period 1 is the only thing collected at publish. Jobs of ≤ 14 calendar days have one period and behave as today.
- **Allocation-based funding.** A period is funded when the sum of `job_funding_allocations` assigned to it (verified succeeded collections and carried-forward credit only — never admin adjustments, which may only change the amount owed) covers its requirement — never because "one succeeded transaction exists". Every cent of every successful collection on a rolling job is allocated to exactly one period or to the job's credit pool.
- **Durable scheduling.** A Postgres outbox (`scheduled_funding_collections`) holds every future collection as a persisted instruction with a stable idempotency key. A **dedicated, short-lived Railway cron service** runs `rake funding:run_due_collections` every 15 minutes and exits; rows are leased with `FOR UPDATE SKIP LOCKED`, no DB transaction or advisory lock is held across a Stripe HTTP call, execution time and leases are bounded, and an **expired lease is reconciled against Stripe before anything is retried**.
- **Five separate truths.** Posting visibility, claim eligibility, funding coverage, work authorization and operational state have independent sources of truth. A job **never becomes active because a date arrives**; only a funded period covering that date moves `work_authorized_through_on`, and `Funding::WorkAuthorization` is consulted at every entry point (activation, start-work, schedule changes, time entries, approvals, pay lines).
- **Payout policy.** Funding coverage, technician entitlement and Stripe transfer eligibility are three separate questions (§12). Legacy jobs keep the whole-job `JobLedger.fully_funded` gate unchanged. Rolling jobs use `Funding::RollingTransferPolicy`: company-funded transfers never exceed the **labor portion** of allocated, available, verified funds after holds and platform-balance reservations (TechFlash fees are never transferable); legitimately due entitlement that company funds cannot cover is recorded as a `technician_compensation_obligation` with a company receivable and is never extinguished — never by weakening transfer safety, never by deducting from the technician, and without changing the payout schedule. A platform compensation reserve to advance such obligations is **D-13, open / not approved**; no reserve amount or reserve-funded transfer is designed as enabled.
- **Legacy & HSI.** Existing jobs are backfilled to `whole_job_upfront` or `legacy_exempt` (HSI #32–38). Legacy jobs are never auto-debited; posting visibility is grandfathered; **new work on a `legacy_exempt` job requires a deliberate funding / work-authorization decision**.
- **Rollout.** Work-authorization and pause enforcement ship and are verified **before** the first rolling-funded job is activated. All behaviour sits behind new flags distinct from the ACH kill switch.

---

## 2. Current code audit

All references are to `skilled_hub_api/` on `main@f8d2753`.

### 2.1 Funding at publish is whole-job and immediate

| Where | What it does today | Consequence for P3 |
|---|---|---|
| `app/services/job_funding_service.rb:69` `fund_for_publish!` | Charges `job.company_charge_cents` (whole schedule) via `collect!(transaction_type: :initial_job_charge)`. Waived company (live `job_funding_waived`) → `status: :open, funding_status: :unfunded, posted_under_funding_waiver: true` (lines 81–90, P2). Unpriced → `funding_status: :funded` vacuously (lines 93–100). | Needs a period-aware amount (period 1 only). The P2 exempt branch is the hook for "planned, not scheduled" periods. |
| `app/services/job_funding_service.rb:185` `collect!` | Locks the Job row, enforces the ACH fail-closed gate, derives key `tf_job_#{job.id}_txn_#{transaction_type}_r#{revision}_#{amount}`, calls `JobStripeOps.create_payment_intent!` (`off_session: true, confirm: true`); reuses an existing `JobPaymentTransaction` with the same key. | Reusable for period charges if `job_funding_period_id`, `scheduled_funding_collection_id` and a new transaction type are threaded through. The key must include the period sequence and attempt. Note the Stripe call currently happens **after** the lock transaction — that separation must be preserved (§8.4). |
| `app/services/job_funding_service.rb:136` `confirm_requires_action!` / `:170 apply_successful_intent!` / `:297 publish!` | 3DS confirmation; a succeeded PI publishes the job. | Period-1 path unchanged; later periods must **not** call `publish!`. |
| `app/services/job_funding_service.rb:327` `default_payment_method_id` | Customer default → first card → first `us_bank_account`. | Scheduler needs a deterministic, recorded method per planned collection so lead time is known. |
| `app/services/job_stripe_ops.rb:73` `create_payment_intent!` | `off_session` default true, `confirm: true`; ACH forces `payment_method_types: ["us_bank_account"]`. | Fit for merchant-initiated recurring charges; `metadata` must carry period and outbox ids. |
| `app/controllers/api/v1/jobs_controller.rb:147` `create`, `:771 finalize_publish_funding!` (via `update` `:251`) | `needs_funding = priced && !waived`; waived → `funding_status: :unfunded, posted_under_funding_waiver: true` (lines 236, 804; P2). | P3 adds `funding_mode` selection and period planning here. |
| `app/controllers/api/v1/jobs_controller.rb:758` `enforce_card_for_publish!` | Requires a payment method before publishing non-waived priced jobs. | Retained; extended to require recurring-use authorization (§9, §18). |

### 2.2 Claim and work-start do not check funding beyond claim eligibility

| Where | Today | Gap |
|---|---|---|
| `app/services/jobs/claim_job_service.rb:86` | `unless @job.funding_allows_claim?` (P2: `funding_funded? \|\| posted_under_funding_waiver? \|\| !priced?`, `job.rb:151`; never consults live `company.job_funding_waived`). | Claim must insert the **deferred first-period collection** (24-hour rule) for exempt-posted jobs and re-plan periods once `ensure_schedule_for_start_mode!` (`:210`) resolves `scheduled_start_at`. |
| `app/services/jobs/claim_job_service.rb:109` `create_claim_atomically!` | Job row lock; `status: :filled` at capacity. | Outbox row inserted inside this transaction. |
| `app/models/concerns/job_effective_status.rb:82` `effective_status` | Returns `"active"` when claimed and `scheduled_start_at <= now` (line 88). **Date arrival alone activates the job.** | Must consult `Funding::WorkAuthorization`; new `awaiting_funding` / `paused` states. |
| `app/controllers/api/v1/time_entries_controller.rb:95` `closed_to_new_time_entries_reason` | Allows time entries on `reserved`/`filled`; no funding check. | One of several enforcement points (§7.4). |
| `time_entries_controller.rb` approve/reject, `create_pay_line!`; `app/services/time_entries/policy_validator.rb`; `app/services/compensation/calculator.rb` | Approval creates `TimeEntryPayLine` from job terms. | Approval and pay-line creation must also check authorization for the entry's work date. |
| Schedule changes: `jobs_controller.rb:513 extend`, counteroffer acceptance (`job_counter_offers_controller.rb` → `ClaimJobService` with offer), schedule proposals, `WeekendWorkRequest` acceptance | None consult funding. | Must re-plan periods and must not extend authorization beyond funded periods. |

### 2.3 No durable deferred execution exists

- `config/environments/production.rb:72`, `staging.rb:31`, `demo.rb:27`: `config.active_job.queue_adapter = :inline`; no Sidekiq/GoodJob/SolidQueue/Redis/cron gem in `Gemfile`.
- `stripe_webhooks_controller.rb:64`: "there is no durable job queue in this app: Active Job is inline".
- `railway.json` has no cron; `CRON_JOBS.md` / `PAYMENTS_SETUP.md:103–115` document that `payments:release_eligible` must be scheduled in the Railway dashboard, with `POST /api/v1/internal/payments/release_eligible` + `X-Payments-Cron-Secret` as an HTTP trigger (`internal_payments_controller.rb`, `payments_release_runner.rb`, `lib/tasks/payments.rake`). `lib/tasks/jobs_lifecycle.rake` + `Jobs::AutoCompleteExpiredService` is the other "scan and act" task.

Conclusion: every timer-based behaviour must be a **persisted instruction scanned by a cron-triggered process**, never `perform_later`/`set(wait:)`, never a request-scoped or browser timer.

### 2.4 Ledger and payout gates (`ledger.fully_funded` callers)

`JobLedger` (`job_ledger.rb:44 summary_for_labor`, `:72 fully_funded: due.zero?`): `collected_cents` = succeeded `COLLECTION_TYPES`; `net_funded_cents` = collected − refunded; `company_required_cents` = labor + company %; `amount_due_cents` = required − net; `fully_funded` = due == 0; labor = approved pay lines when finished else agreed labor (`:79`).

| Caller | Whole-job semantics today | P3 |
|---|---|---|
| `payment_service.rb:94` `release_to_technician` | Transfer only when `fully_funded`; cap `payout_amount <= net_funded_cents` (`:155`); blocks on processing collections, pending refunds, blocking `PaymentRiskEvent`, existing transfer; key `tf_job_#{id}_txn_technician_transfer_r#{rev}`; 23 h idempotency-safe window (`:420`). | **Legacy modes unchanged.** Rolling jobs branch to `Funding::RollingTransferPolicy` (§12) which keeps every protection except the whole-job `fully_funded` requirement and the single-transfer assumption. |
| `job_settlement_service.rb:45`, `:130` `settle!` | Final true-up; shortfall → `final_hours_top_up`; surplus refund; else `settlement_blocked`. | Legacy unchanged. Rolling: `Funding::RollingSettlement` (§12.5) — shortfall collection attempted, but technician entitlement is not held hostage to it. |
| `jobs/terminate_assignment_service.rb:236` | Settlement complete = due 0 ∧ refundable 0 ∧ fully funded. | Legacy unchanged; rolling uses the rolling settlement definition. Termination truncates schedule → future periods voided. |
| `lib/tasks/payments.rake:36,38` | Reporting. | Period-aware rows. |
| `app/serializers/job_serializer.rb:149` | UI. | Period/authorization sub-hashes (§14). |
| `lib/staging_ach_e2e_runner.rb` | Staging harness. | Extend. |

`PaymentService.source_transaction_decision` already uses `platform_balance` when more than one succeeded charge exists. `PaymentRiskEvent.blocking` (`payment_risk_event.rb:44`) blocks transfers on post-success returns/disputes.

### 2.5 Waiver / exemption after P2 (merged)

- `company_profiles.job_funding_waived` (admin toggle `admin/users_controller.rb:348`) governs **new postings only** (`job_funding_service.rb:79–81`).
- `jobs.posted_under_funding_waiver` is the persisted per-job exemption marker; `Job#historically_funding_exempt?` (`job.rb:142`) is the only authorization evidence for already-posted jobs; `Job#legacy_funded_without_collections?` (`job.rb:134`) is diagnostic only and never implies a waiver.
- `JobFundingAdjustmentService.reconcile!` (`:24–42`) keeps exempt jobs `unfunded` with the marker unless the ledger is genuinely fully funded.
- `rake jobs:reclassify_waived_funding` is read-only; `docs/DRY_RUN_RECLASSIFY_WAIVED_FUNDING.md` lists HSI jobs 32–38 as Category A candidates (funded → unfunded, marker → true) and 28–31 as "leave" (real collections). P3 assumes this reclassification is applied (with owner authorization) **before** `funding_mode` backfill, so 32–38 carry the marker.

### 2.6 Other observations

- `Job#claim_capacity` = 1 — period plan is per job.
- `JobTermination` unique per job, records `work_performed`; `TerminateAssignmentService` settles after commit — the home for voiding future periods.
- Webhooks locate collection txns by PI id or `metadata.transaction_id` (`stripe_webhooks_controller.rb:618`); "failed after success" raises an investigation. Period charges reuse this path; success handler must allocate, mark the period funded, extend authorization and resume — and must not call `publish!` for sequence > 1.
- `AchAccess` is fail-closed and gates ACH period charges; current mandate copy (`ACH_PAYMENTS.md` decision 4) covers posting, counteroffer deltas and settlement top-ups — **not** recurring period debits (§18).
- Frontend: `JobDetail.jsx:1183–1214` (funding copy), `EditJob.jsx:220` (`termsLocked`), `CreateJob.jsx:808–830`, `AdminJobPaymentsPage.jsx`, `CompanyPaymentMethodsPanel.jsx`, `jobStatus.js` (no `paused`/`awaiting_funding`).

---

## 3. Approved business requirements

| # | Requirement | Design element |
|---|---|---|
| R1 | A normal posting funds **only the first two weeks** of scheduled work. | Period 1 at publish (§5, §7.1). |
| R2 | An admin posting exemption permits **publication without payment only** — not collected, not funded, not work-authorized, not payout-authorized, not a waiver of future funding. | `posted_under_funding_waiver` (P2) + `funding_mode` + `Funding::WorkAuthorization` (§7, §13). |
| R3 | Exempt job claimed: start > 24 h after claim → initiate first-two-week collection 24 h after claim; ≤ 24 h → initiate immediately. Rule governs initiation, not success. Durable, recoverable, idempotent; never a browser/in-memory timer. | Outbox row inserted in the claim transaction (§7.3, §8). |
| R4 | **No unfunded work.** ACH processing ≠ collected. Delay communicated clearly. A job is never active merely because the claim date or scheduled start arrives. | Work authorization requires an allocated-funded period covering the date (§7.4, §9, §11). |
| R5 | Every later two-week period funded **in advance with lead time**. | §9, §10. |
| R6 | Funding failure → pause, stop new work authorization, notify both parties, preserve records, allow safe resumption. | §11. |
| R7 | Pausing never eliminates compensation for hours already worked. | Entitlement is independent of company funding and survives shortfalls as an obligation (§12). |
| R8 | Card and ACH; off-session recurring charges need proper prior authorization; never assume an initiated ACH is funded. | §9, §18. |
| R9 | No automatic clawbacks, transfer reversals or wage deductions by default. | No new reversal/deduction paths (§12.7). |
| R10 | Do not change the technician payout schedule. | Payout timing stays finish / termination + 72 h or both ratings (§12.3). |

---

## 4. Recommended architecture

```
 Job (existing)  + funding_mode · work_authorized_through_on · paused_at/paused_on/pause_reason
   │ 1..n                                  │ 0..n
 job_funding_periods ◄──allocations──── job_funding_allocations ──► job_payment_transactions (+period id, new types)
   │ 0..n                                                           credit pool (period_id NULL)
 scheduled_funding_collections (OUTBOX: persisted instruction, idempotency key, lease, attempts)
   │  leased with FOR UPDATE SKIP LOCKED in a short txn; Stripe call outside any txn
 Railway cron service (every 15 min, runs rake, exits) ──► Funding::CollectionRunner
   │                                                        ├─ Funding::CollectionReconciler (expired leases, outcome_unknown)
   │                                                        └─ funding_scheduler_runs (heartbeat / monitoring)
 Stripe PaymentIntent ──► webhooks ──► Funding::Allocator ──► Funding::PeriodStateService
                                                              (funded / failed / pause / resume / authorization)
 Funding::WorkAuthorization  ← consulted by effective_status, activation, start-work, schedule changes,
                                time entries (create/approve), pay lines, settlement
 Funding::RollingTransferPolicy / RollingSettlement  ← used by PaymentService / JobSettlementService
                                                        ONLY for funding_mode = rolling_two_week
 technician_compensation_obligations ──► company_receivables   (platform reserve: D-13 open, nothing enabled)
```

Principles:

1. **Persist the instruction, then act.** Every future action is a row before it is a Stripe call; crashes are reconciled from the row's idempotency key and Stripe metadata.
2. **One writer per concept.** `PeriodPlanner` creates/re-plans periods; `CollectionRunner` executes outbox rows; `Allocator` writes allocations; `PeriodStateService` is the sole writer of period status, `paused_*` and `work_authorized_through_on`; webhooks call these services.
3. **Reuse the money path.** Period charges go through `JobFundingService.collect!` / `JobStripeOps` so the ACH gate, row locking, idempotency and webhook reconciliation are shared.
4. **Three separate payout questions** (coverage, entitlement, transfer eligibility), each with its own data (§12).
5. **Everything behind flags; legacy jobs opt-in only; enforcement before activation.**

---

## 5. Two-week funding calculation

### 5.1 Period boundaries (D-1, D-2, D-3 approved)

- Anchor = `job.scheduled_start_at` in `job.job_timezone` → `anchor_on`. Periods are **job-start-relative** and recalculated on claim (rolling-start jobs carry `projected` periods until then).
- Period k = `[anchor_on + 14(k−1), anchor_on + 14k − 1]`, clipped to `scheduled_end_at` / `hard_deadline_at`.
- Working dates from `Schedule::WorkingIntervalExpander.working_dates_between`; accepted `WeekendWorkRequest` dates are included as adjustments.
- Jobs ≤ 14 calendar days: exactly one period.
- A period with zero working dates is created with requirement 0 and auto-funded so the sequence stays contiguous.

### 5.2 Amount per period

Integer cents via `JobMoney` (`BigDecimal`, `ROUND_HALF_UP`), snapshotting commission percentages as `JobFundingService.snapshot_company!` does.

`actual_hours_worked`: `scheduled_hours` = Σ shift hours per working date (`standard_day_shifts`, fallback `hours_per_day`); `labor_cents = JobMoney.labor_cents(rate, hours)`; `company_required_cents = labor + percent_of(labor, company_pct)`; `tech_payout_target_cents = labor − percent_of(labor, tech_pct)`. Invariant Σ period labor == `job_amount_cents`; rounding residue to the last period.

`guaranteed_job_pay`: `agreed_labor_cents` prorated by working days (floor, remainder to last period).

### 5.3 Premiums (D-4 approved)

Base periods fund scheduled labor. Additional approved hours (overtime, weekend premiums, extra shifts) are **billed in the next funding cycle**, with an **immediate top-up** when the approved amount would otherwise exceed the period's allocated coverage (§10.3).

### 5.4 Examples

| Job | Periods | Period 1 collects |
|---|---|---|
| 5 days Mon–Fri, 8 h, $50/h, 10 % fee | 1 | $2,000 + $200 = **$2,200** (identical to today) |
| 6 weeks Mon–Fri, 8 h, $50/h, 10 % | 3 | 10 days → **$4,400**; periods 2–3 same |
| 3 weeks Mon–Thu, 10 h, $40/h, 10 % | 2 | 8 days → **$3,520**; period 2 (4 days) $1,760 |
| Guaranteed $9,000 / 30 working days | 3 | $3,000 + fee |

---

## 6. Funding-period data model and allocation

### 6.1 `job_funding_periods`

`sequence` (unique with job), `period_start_on`/`period_end_on`, `scheduled_working_days`, `scheduled_hours`, `labor_cents`, `company_required_cents`, `tech_payout_target_cents`, `pending_adjustment_cents` (signed; approved-hour overages/credits rolled into this period's collection), `financial_revision`, `status`, `planned_payment_method_type`, `collection_initiate_at`, `funding_due_at` (local midnight of `period_start_on`), `funded_at`, `failed_at`, `voided_at`, `void_reason`.

### 6.2 `job_funding_allocations` — the funding truth for a period

| Column | Meaning |
|---|---|
| `job_id`, `job_funding_period_id` (nullable) | NULL period = the job's **credit pool** (unallocated). |
| `source_type` | **Verified cash only:** `collection` (succeeded `job_payment_transaction`), `refund` (negative, tied to a refund txn), `credit_transfer` (move between pool and a period; always paired +/−, so it never creates cash). `reserve_backing` is a reserved enum value only (see §12.6; it could exist only after D-13 is decided, written only against an explicitly authorized, financially backed `technician_compensation_obligation`; excluded from company coverage; no code path writes it in P3). There is **no** admin "adjustment" allocation type — no row in this table may originate from anything other than money that actually arrived. |
| `source_id` | txn / obligation id. |
| `amount_cents` | Signed integer. |
| `created_by_type/id`, `reason`, `created_at` | Audit. |

Three distinct things that must never be conflated:

| | What it changes | Mechanism | Can it make a period funded? |
|---|---|---|---|
| (a) **Requirement adjustment** | the amount the company **owes** for the period (`company_required_cents`, `pending_adjustment_cents`) | audited `financial_revision` bump (D-4 true-ups, approved-hour overages, schedule changes, admin corrections with reason; audit row in `job_term_change_audits`, `change_type: funding_requirement_adjustment`) | Only by **lowering** the requirement to what verified cash already covers. It never adds cash. |
| (b) **Cash allocation** | which period a **verified** dollar is assigned to | `collection` / `refund` / `credit_transfer` rows, written by `Funding::Allocator` from succeeded transactions or legitimately existing pool credit | Yes — this is the only ordinary way. |
| (c) **Platform-backed funding** | technician compensation the company has not funded | `reserve_backing` rows mirroring an explicitly authorized, financially backed reserve obligation (§12.6) — **not available in P3; D-13 open** | Only where explicitly authorized for that obligation, and only after D-13; never counted as company cash, never fictional, never as coverage for new work authorization. |

Rules:

- `period.required_cents = company_required_cents + pending_adjustment_cents` (requirement side; changes only via (a)).
- `period.allocated_cents = Σ allocations where period_id = period.id and source_type ∈ {collection, refund, credit_transfer}` (verified cash side).
- **Period funded ⇔ `allocated_cents >= required_cents`** (or `required_cents == 0`). Multiple partial collections and carried pool credit count; a single succeeded transaction is neither necessary nor sufficient; **no adjustment, override, note or admin action counts as cash**. `reserve_backing` never advances `work_authorized_through_on`.
- An admin who believes a period is "really paid" must either locate the verified transaction (attach PI id via reconciliation, §8.5) or lower the requirement through (a) with a reason — there is no path that fabricates a credit.
- For every succeeded collection txn on a rolling job: Σ its `collection` allocations == `txn.amount_cents` − Σ refunds against it. Every cent is allocated to exactly one period or to the pool.
- `Funding::Allocator.allocate_collection!(txn)` runs under the Job row lock when a collection becomes `succeeded` (runner or webhook, idempotent on `source_id`): fill the targeted period up to `required_cents`; surplus → pool. Before scheduling a collection, `Allocator.apply_pool_credit!(period)` moves pool credit into the period and reduces the outbox amount (D-6: unused prepaid funds carry forward).
- Pool credit remaining at job completion/termination is refunded via `period_funding_refund` (D-6) through the existing refund machinery; negative allocation rows record the refund.
- `JobLedger` whole-job sums remain exactly Σ cash allocations (collections − refunds) — the two views reconcile by construction; `rake funding:verify_allocations` asserts it and additionally asserts that no allocation row exists without a succeeded/refunded transaction or an authorized obligation behind it.
- Each cash allocation carries the period's snapshotted split, so `labor_allocated_cents(k) = floor(min(allocated, required) × labor_cents(k) / required_cents(k))` and the remainder is the TechFlash fee portion. Only the labor portion can ever back a technician transfer (§12.4).

### 6.3 Transactions

`job_payment_transactions.job_funding_period_id` (nullable) and `scheduled_funding_collection_id` (nullable). New `transaction_type` values: `period_funding_charge` (10, in `COLLECTION_TYPES`), `period_funding_refund` (11, in `REFUND_TYPES` and `SETTLEMENT_REFUND_TYPES`), `reserve_technician_transfer` (12, reserved value; outbound, would be funded only from TechFlash capital, never customer prepaid balances; excluded from company coverage and from `net_funded_cents`; **no executable path in P3 — disabled until the owner decides D-13**). `initial_job_charge` stays for `whole_job_upfront` jobs.

---

## 7. Posting, claim, start and work-authorization state machines

| Concept | Question | Source of truth | Writer |
|---|---|---|---|
| Posting visibility | Listed? | `jobs.status`, `go_live_at` | publish/unpublish/webhooks |
| Claim eligibility | Claimable? | `available_for_claim?` ∧ `funding_allows_claim?` (P2; extended with `partially_funded`) | read-only |
| Funding coverage | Which periods are covered by allocated cash? | `job_funding_periods.status`, `job_funding_allocations` | `PeriodStateService` / `Allocator` |
| Work authorization | May work happen on date *d*? | `work_authorized_through_on`, `paused_on`, `admin_work_authorization_override_until` | `PeriodStateService` (+ audited admin override) |
| Operational | active / awaiting_funding / paused / ended | derived `effective_status` | derived |

Detailed transition tables: `docs/ROLLING_FUNDING_STATE_MACHINE.md`.

### 7.1 Posting (normal, rolling)

Publish → collect period 1 (`period_funding_charge`, seq 1). Card succeeded → `open`, `funding_status: partially_funded` (new value 4; `funded` if single period), period 1 funded via allocation, `work_authorized_through_on = period_1.period_end_on`. `requires_action` → `pending_funding`/`adjustment_required` (existing 3DS path). ACH processing → `pending_funding` until `succeeded` webhook (existing). Failed → `funding_failed`. `funding_allows_claim?` and `funded_terms_locked?` include `partially_funded`.

### 7.2 Posting (admin exemption)

Publish with live company waiver → P2 behaviour (`unfunded`, `posted_under_funding_waiver: true`) plus `funding_mode: rolling_two_week` and periods `planned` with **no** outbox rows. Visible and claimable; `work_authorized_through_on` nil → not work-authorized (R2).

### 7.3 Claim

Inside `create_claim_atomically!`'s transaction:

1. Resolve schedule; re-plan periods from the resolved start (replace `projected`).
2. Exempt-posted priced job: insert `scheduled_funding_collections(kind: deferred_initial, period 1, run_at)` with `run_at = claim_at + 24 h` if `scheduled_start_at > claim_at + 24 h`, else `run_at = claim_at` (R3). For the immediate case the request makes one best-effort `CollectionRunner.run_one(row)` **after commit**; the row remains the truth and the cron picks it up otherwise.
3. Normally funded job: schedule periods 2..n with lead time (§9).
4. Compute `earliest_fundable_at` for the company's planned method (card: now; ACH: now + ACH lead). If `scheduled_start_at < earliest_fundable_at` the claim still succeeds but the job is flagged `start_at_risk`, and the **company UI must offer exactly two options**: (a) fund period 1 **now by card** through a properly authorized on-session PaymentIntent (3DS as needed), or (b) **delay the start** via the existing schedule-proposal flow. There is no override and no credit extension; the technician is told work is not authorized until funding is confirmed.
5. Notifications state whether work is authorized and through which date.

### 7.4 Work authorization — enforced at every entry point

`Funding::WorkAuthorization.for(job)` exposes `authorized_on?(date)`, `authorized_now?`, `reason`:

```
authorized_on?(d) =
  job.status ∈ {reserved, filled}
  ∧ ( ( funding_mode == whole_job_upfront
        ∧ ( verified_whole_job_funded?                          # JobLedger.fully_funded from SUCCEEDED collections, net_funded_cents > 0
          ∨ !priced? ) )                                        # the documented zero-required-funding exception (company_required_cents == 0)
    ∨ (work_authorized_through_on.present? ∧ d <= work_authorized_through_on
       ∧ (paused_on.nil? ∨ d < paused_on))
    ∨ (admin_work_authorization_override_until.present? ∧ d <= it) )   # audited, time-bounded, §13.4
```

`verified_whole_job_funded?` is computed from succeeded `COLLECTION_TYPES` transactions minus refunds (`JobLedger.net_funded_cents >= company_required_cents`), exactly as P2's `funding_funded?` requires for priced jobs. A whole-job collection that is `processing` (ACH), `pending`, `requires_action`, `failed` or `canceled` does **not** authorize work; neither does `funding_status` alone, the `posted_under_funding_waiver` marker, or `legacy_funded_without_collections?` rows. `legacy_exempt` jobs have no clause until a decision is recorded (§13), so they are not authorized for new work once enforcement is on.

**Statement of rule:** arrival of the claim date, the scheduled start, or any period's `period_start_on` never authorizes work. For rolling jobs only `PeriodStateService.mark_funded!(period)` (verified cash allocation covers requirement) advances `work_authorized_through_on`; for whole-job jobs only verified succeeded collections covering the whole requirement (or the zero-requirement exception) authorize; only an audited admin override can substitute for either.

Entry points that must call it (all return a user-safe reason):

| Entry point | Check |
|---|---|
| `effective_status` (`job_effective_status.rb:82`) | `"active"` only if `authorized_now?`; else `"awaiting_funding"` or `"paused"`. |
| Assignment activation / any "start work" or check-in action (today implicit by date; made explicit) | refuse unless `authorized_on?(today)`. |
| `ClaimJobService` | claim allowed by `funding_allows_claim?`; result payload carries authorization status. |
| Schedule changes: counteroffer acceptance, schedule proposals, `extend`, `WeekendWorkRequest` acceptance, `rolling_start` resolution | re-plan periods; never extend `work_authorized_through_on`; refuse weekend/extra-day requests dated beyond authorization unless a funded period covers them or the request is explicitly "subject to funding". |
| `TimeEntriesController#create` | `authorized_on?(entry.work_date)`. |
| `TimeEntriesController#approve` → `create_pay_line!` | `authorized_on?(work_date)`; otherwise refuse. Admin may approve an unauthorized-date entry only with an audited override (`approval_override_reason`), which creates technician entitlement that the company must fund (obligation + company receivable if it does not, §12.6). |
| `Compensation::Calculator` pay-line creation | refuse for unauthorized dates unless override present. |
| Settlement / transfer (`RollingSettlement`, `RollingTransferPolicy`) | entitlement counts only approved pay lines (authorized or override-approved). |
| Auto-complete (`AutoCompleteExpiredService`) | unaffected (ends jobs; never authorizes). |

---

## 8. Durable scheduler recommendation

### 8.1 Options evaluated

| | A. Railway Cron + rake scan | B. DB outbox + supervised worker | C. Durable Active Job adapter (GoodJob/SolidQueue) |
|---|---|---|---|
| Durability of intent | Only with persisted rows | Yes | Yes |
| New infra | Cron service (dashboard) — existing pattern | Always-on worker + supervision | Gem + migrations + worker |
| Precision | 15 min (sufficient) | seconds | seconds |
| Risks | Missed/skipped runs, drift (monitor) | Crash loops | Scope creep |
| Fit | Mirrors `payments:release_eligible` | New | New |

### 8.2 Recommendation: outbox rows + dedicated 15-minute Railway cron service

- **Service:** a dedicated Railway **cron service** built from the same `skilled_hub_api` image, start command `bundle exec rake funding:run_due_collections`, schedule `*/15 * * * *`. It runs and **exits**; it is not the web service. Railway **skips a scheduled run if the previous one is still active**, and execution times may **drift**, so the runner bounds its own runtime (`MAX_RUNTIME_SECONDS = 600`, `MAX_BATCH = 50`) and all deadlines carry ≥ 1 h of slack. `POST /api/v1/internal/funding/run_due_collections` with `X-Payments-Cron-Secret` is a manual/fallback trigger that runs the same code with the same bounds.
- **Persisted instruction:** each `scheduled_funding_collections` row holds `kind`, `amount_cents`, `run_at`, `idempotency_key` (stable, unique: `tf_job_<job>_period_<seq>_pfc_r<rev>_a<attempt>`), `stripe_request_started_at`, `stripe_payment_intent_id`, lease columns, attempts and errors.
- **Option C** remains the upgrade path: because intent lives in our table, swapping the executor later is a one-service change.

### 8.3 Runner algorithm (`Funding::CollectionRunner`)

```
run_id = FundingSchedulerRun.start!(host:)                     # heartbeat row
abort unless PlatformSetting rolling_funding_scheduler_enabled && ENV ROLLING_FUNDING_DISABLED blank
deadline = now + MAX_RUNTIME_SECONDS

# 1. Reconcile first (never retry before reconciling)
CollectionReconciler.run!(limit:, deadline:)                   # §8.5: expired leases, awaiting_webhook past SLA, outcome_unknown

# 2. Lease due rows — short transaction, no Stripe inside
rows = transaction {
  ScheduledFundingCollection.pending.where("run_at <= now()").order(:run_at)
    .lock("FOR UPDATE SKIP LOCKED").limit(MAX_BATCH)
    .update_all(status: leased, locked_by: run_id, lease_until: now + 10.min)   # RETURNING ids
}

# 3. Execute each row outside any DB transaction
rows.each do |row|
  break if now > deadline
  # 3a. Short transaction: lock Job, re-validate (period not voided/funded, job not terminated/finished,
  #     flags on, mode rolling, company method usable, pool credit applied → final amount), create/lookup
  #     JobPaymentTransaction by row.idempotency_key, stamp row.stripe_request_started_at. COMMIT.
  # 3b. Stripe call (no transaction, no advisory lock held): JobStripeOps.create_payment_intent!(..., idempotency_key: row.idempotency_key,
  #     metadata: {job_id, transaction_id, job_funding_period_id, scheduled_funding_collection_id})
  # 3c. Short transaction: record stripe_payment_intent_id; on succeeded → Allocator + PeriodStateService.mark_funded!;
  #     processing → awaiting_webhook; requires_action → awaiting_action (+notify); definitive failure → failed/exhausted (+backoff clone);
  #     ambiguous error/timeout → outcome_unknown. COMMIT.
rescue StandardError → row.error (attempts not incremented for non-definitive errors); continue
end

# 4. Due-date enforcement (same run, same bounds): periods with funding_due_at <= now and status != funded
#    while rolling_funding_auto_pause_enabled → PeriodStateService.pause!(job, reason)
FundingSchedulerRun.finish!(run_id, stats)
```

Concurrency is handled by `SKIP LOCKED` leasing alone; **no advisory lock** is needed and none is held across Stripe. Two overlapping runs (manual trigger during a cron run) safely share the queue.

### 8.4 Protections

- Unique `idempotency_key` on the outbox table and on `job_payment_transactions` (existing unique index): the DB refuses a duplicate charge attempt.
- Lease (`lease_until`, `locked_by`) bounds how long a row can be "in flight"; runtime bound guarantees the process exits before the next cron slot.
- Re-validation under the Job row lock immediately before each Stripe call.
- Stripe `metadata` carries all ids; webhooks reconcile by PI id first, metadata second.
- `attempt` increments **only after a definitive failure** (card decline, ACH `payment_failed`, PI `canceled`). Ambiguous outcomes never mint a new key.
- Max attempts: cards 3 (backoff 1 h, 6 h; last attempt ≥ 12 h before due); ACH 1 (D-7: no automatic retry after definitive failure).
- Kill switch `ROLLING_FUNDING_DISABLED`: runner exits before leasing; nothing is paused or charged; monitoring alerts that deadlines may pass.
- `--dry-run` prints planned actions without Stripe calls or state changes.

### 8.5 Collection reconciliation rules (`Funding::CollectionReconciler`)

Precedent: `PaymentService` treats transfer retries as unsafe after `TRANSFER_IDEMPOTENCY_SAFE_WINDOW = 23.hours` and reconciles via `find_transfer_for_transaction`. The same discipline applies to collections. **A lease timeout is not evidence that Stripe failed.**

| Row state found | Action |
|---|---|
| `leased` with `lease_until < now` and `stripe_request_started_at` nil | Stripe was never called → set `pending` (no new key). |
| `leased` expired, `stripe_request_started_at` set, `stripe_payment_intent_id` set | `PaymentIntent.retrieve(id)` → apply outcome (succeeded → allocate/fund; processing → `awaiting_webhook`; `requires_payment_method`/`canceled` → definitive failed; `requires_action` → `awaiting_action`). |
| `leased` expired, request started, **no PI id recorded** | (a) look up `JobPaymentTransaction` by `idempotency_key` for a PI id; (b) `PaymentIntent.search(query: "metadata['scheduled_funding_collection_id']:'<id>'")` — wait ≥ 15 min after `stripe_request_started_at` for search-index lag; (c) if found → apply outcome; (d) if not found and `now − stripe_request_started_at < 23 h` → set `pending` and **retry with the same key** (Stripe de-duplicates); (e) if not found after 23 h → `needs_admin_reconciliation`; never auto-mint a new key. |
| `outcome_unknown` | Same as the row above. |
| `awaiting_webhook` older than 6 business days | Retrieve PI; if still processing → extend; if terminal → apply; if not found → `needs_admin_reconciliation`. |
| `awaiting_action` past `funding_due_at` | Mark `failed(action_not_completed)`; period handling per §11. |
| Webhook arrives for a row in any state | Webhook outcome wins when it is terminal; `StripeWebhookEvent` idempotency prevents double application; allocations are idempotent on `source_id`. |

Admin reconciliation UI shows the row, the Stripe search result, and offers "mark failed (confirmed no PI)" or "attach PI id"; both audited.

### 8.6 Monitoring (`funding_scheduler_runs` + `GET /api/v1/admin/funding/scheduler`)

| Signal | Threshold / alert |
|---|---|
| No `funding_scheduler_runs` row in | 45 min (missed/skipped runs, service down) |
| Oldest `pending` row with `run_at < now` | > 60 min overdue |
| Rows `leased` with `lease_until < now` | > 0 for > 30 min (stuck) |
| `needs_admin_reconciliation` or `outcome_unknown` | > 0 |
| Periods with `funding_due_at < now + 24 h` not funded | list, per job |
| Runs hitting `MAX_RUNTIME_SECONDS` | > 2 consecutive (backlog) |
| `verify_allocations` mismatch | any |

Alerts via the existing admin notification path and logged with a stable prefix for Railway log alerts.

### 8.7 Failure scenarios

| Scenario | Behaviour |
|---|---|
| Cron service not created / disabled | Heartbeat alert; rows wait; manual trigger or `rake` runs the same code. |
| Previous run still active at the next slot | Railway skips; runtime bound makes this rare; slack absorbs drift. |
| Process dies after Stripe success, before DB write | Lease expires → reconciler retrieves/searches PI → applies success; webhook also lands. **No second charge.** |
| Process dies before Stripe call | `stripe_request_started_at` nil → back to `pending`. |
| Company removed payment method | Pre-check fails → `failed(no_payment_method)`; notify; pause at due. |
| ACH processing at due | Not funded → pause `ach_processing` with "still clearing" copy; webhook success auto-resumes. |
| Stripe 5xx / timeout | `outcome_unknown` → reconciler; same key within 23 h. |
| Job terminated between schedule and run | Re-validation cancels the row. |
| Counteroffer after planning | Revision bump → unfunded periods voided; pending rows canceled; re-plan. |

---

## 9. Card vs ACH lead times (D-5 approved)

Stripe facts (docs retrieved 2026-11-11: [ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Save and reuse cards](https://docs.stripe.com/payments/save-and-reuse-cards-only)): ACH outcome up to 4 business days; settlement T+4 (T+2 if enabled); ACH refunds up to 3 business days; disputes final (60 calendar days personal / 2 business days business); idempotency keys retained ≥ 24 h; off-session cards may fail with `authentication_required`.

| | Card | ACH |
|---|---|---|
| `collection_initiate_at` | `funding_due_at − 3 calendar days`, moved to the preceding **business day** if it lands on a weekend/US bank holiday | `funding_due_at − 7 calendar days`, moved earlier so that ≥ 5 **banking days** (Federal Reserve holiday calendar) remain before due |
| Retry | up to 3 attempts (1 h, 6 h backoff) | none automatic (D-7); company asked to pay by card or re-authorize |
| `requires_action` | notify; on-session confirm; reminder T−24 h | n/a |
| Not funded at due | pause `funding_not_received` / `payment_action_required` | pause `ach_processing` (delay copy) or `ach_failed` |
| Authorization | SetupIntent `usage: off_session` (existing) + explicit recurring-charge consent recorded (`recurring_charge_authorized_at/_version`) | Mandate at bank setup; copy must cover recurring variable debits before Phase F (§18) |
| Processing ≠ funded | — | enforced by allocation only on `succeeded` |

`planned_payment_method_type` is stored per period at scheduling time. If the company switches the default to ACH too late for the next due date, both parties are warned and the card-now / delay options from §7.3 apply.

---

## 10. Automatic replenishment, true-ups, cancellation

### 10.1 Scheduling triggers

Publish (periods 2..n), claim (deferred initial; re-plan), `extend` (append periods), counteroffer acceptance (re-plan), termination/finish (cancel pending rows, void unfunded periods, refund pool credit and unused funded allocations).

### 10.2 Amount

`amount = max(0, period.required_cents − period.allocated_cents)` after `Allocator.apply_pool_credit!`. A fully pre-covered period produces no Stripe call and is marked funded directly.

### 10.3 Approved-hour true-ups (D-4 approved)

When pay lines are approved for period k:

- `consumed_cents(k)` = Σ approved pay-line labor in k + company %.
- If `consumed_cents(k) <= allocated_cents(k)`: nothing now; any surplus carries forward (D-6).
- If `consumed_cents(k) > allocated_cents(k)` (coverage would be exceeded): the excess is an **immediate top-up** — `pending_adjustment_cents(k) += excess` and an outbox row `kind: true_up, run_at: now` is created; approvals that would exceed coverage are still recorded (entitlement exists) but the job is flagged `coverage_exceeded` and further new-date authorization does not advance until the top-up succeeds.
- Otherwise additional approved hours beyond scheduled labor are **billed with the next cycle**: added to period k+1's `pending_adjustment_cents` before its collection runs (or to the final settlement for the last period).

### 10.4 Unused prepaid funds (D-6 approved)

Under-consumption is never refunded mid-job; it stays in the period/pool as credit, reduces later collections, and the remaining credit is **reconciled and refunded at job completion or termination** via `period_funding_refund`.

### 10.5 Cancel vs. void vs. processing debit

| Situation | Action | Outcome record |
|---|---|---|
| Outbox row `pending` (no Stripe request yet) and period voided/job ended/flags off | `canceled` — no Stripe object exists | row audit |
| Row `leased` with request started but outcome unknown | reconcile first (§8.5); then treat per actual PI state | — |
| PI `requires_action` (card) | `PaymentIntent.cancel`; txn `canceled` | row `canceled` |
| PI **processing** (ACH debit already initiated) | attempt `PaymentIntent.cancel` (Stripe allows cancelling processing ACH only within a limited window and may refuse). If cancelled → txn `canceled`, no allocation. If refused → leave `awaiting_webhook`; the debit **will** settle or fail; never mark it canceled locally. | row `cancel_refused_processing` |
| Processing debit later **succeeds** for a voided period / ended job | `Allocator` allocates to the **pool** (not the voided period); `Funding::ExcessCollectionResolver` records an auditable outcome: if the job continues → `credit_transfer` to the next unfunded period; if the job is ended → `period_funding_refund` (ACH refund, up to 3 business days, cannot be cancelled) | allocation rows + audit |
| Card charge succeeded for a period that is subsequently voided | same resolver: credit forward or refund | same |

Pool credit and refunds appear in billing history with period context.

### 10.6 Notifications

Company: T−lead advance notice (amount, date, period), success, failure with CTA (pay by card / update method), pause warning 24 h before due. Technician: next period funded; "funding delayed — do not start work on <date>"; pause; resume. Existing mailer/notification paths; sandboxed in staging.

---

## 11. Pause / resume

### 11.1 Triggers (`pause_reason`)

`funding_not_received`, `ach_processing`, `payment_action_required`, `coverage_exceeded_unpaid` (true-up failed past its deadline), `dispute_or_return` (blocking `PaymentRiskEvent` on a period charge), `admin`.

### 11.2 Effects (one transaction, Job row locked; `PeriodStateService.pause!`)

`paused_at`, `paused_on` (job tz date), `pause_reason` set; `status` unchanged (`filled`), `effective_status → "paused"`; `work_authorized_through_on` unchanged (authorization for dates ≥ `paused_on` denied by the predicate); time entries dated `< paused_on` remain submittable/approvable (R7); schedule, deadline, applications, ratings untouched; both parties notified; immutable pause history row appended (D-8: reuse `job_term_change_audits` with `change_type: funding_pause|funding_resume` — it already stores actor, before/after JSON and timestamps and is append-only; if a later audit shows it is mutable, a `job_pause_events` table replaces it). Period status → `paused_unfunded`; `funding_status → funding_failed` only for definitive failures.

### 11.3 Resume

Automatic when the blocking period becomes funded (allocation covers requirement): clear pause fields, `work_authorized_through_on = period.period_end_on`, audit, notify. Manual admin resume requires the current period funded and no blocking risk event. **Schedule after pause (D-9 approved):** original dates are kept; days lost during the pause are lost (their scheduled labor becomes carried credit) unless company and technician agree to reschedule through the existing schedule-proposal flow, which re-plans periods.

### 11.4 Pause deadline (prevents indefinite blocking of due compensation)

A pause for company funding reasons that lasts **7 calendar days** (`rolling_funding_pause_settlement_days`, PlatformSetting) ends the assignment early through `TerminateAssignmentService` with reason `company_funding_lapsed` (initiated_by `admin`/system actor, audited), which truncates the schedule, voids future periods, refunds credit, and settles earned hours under §12 so the technician's payout clock (72 h / ratings) starts. Reminders at day 3 and day 5. D-12 approved: **no new cancellation/standby fee in P3**; a separate policy follows legal review.

### 11.5 Compensation guarantee (R7)

Hours worked before the pause were authorized only while their period was funded, so allocated cash exists for them. If that cash is later lost (ACH return/dispute) the technician's entitlement survives as an open obligation with a company receivable (§12.6); the loss is the company's debt, never the technician's. Whether TechFlash advances such amounts is D-13 (open).

---

## 12. Funding coverage, technician entitlement and transfer eligibility

### 12.1 Three questions, three answers

| Question | Definition | Data |
|---|---|---|
| **Funding coverage** (per period) | `allocated_cents(k) >= required_cents(k)` | `job_funding_allocations`, `job_funding_periods` |
| **Technician entitlement** (whole assignment to date) | `entitled_cents` = Σ technician amounts of approved `TimeEntryPayLine`s for authorized (or override-approved) dates, plus for `guaranteed_job_pay` the prorated guaranteed amount for authorized periods actually worked/ended; minus `transferred_cents`. Entitlement exists the moment hours are approved; it does **not** depend on whether the company's later collections succeed, and it is never extinguished by a shortfall. | `time_entry_pay_lines`, `job_payment_transactions` (transfers), `technician_compensation_obligations` |
| **Transfer eligibility** (Stripe) | Legacy modes: `PaymentService.release_to_technician` unchanged (whole-job `fully_funded`). Rolling: `Funding::RollingTransferPolicy` (§12.4) — bounded by the **labor portion** of verified allocated cash, prior transfers, holds and platform-balance reservations. | `JobLedger`, allocations, `PaymentRiskEvent`, Connect state, `Funding::PlatformBalanceReservations` |

### 12.2 Legacy jobs (`whole_job_upfront`, `legacy_exempt`)

Nothing changes: `payment_service.rb:94` requires `ledger.fully_funded`, caps at `net_funded_cents`, blocks on processing collections / pending refunds / risk events / existing transfer; `JobSettlementService.settle!` and `TerminateAssignmentService` behave exactly as today.

### 12.3 Payout schedule (R10, D-10 approved)

Unchanged for all modes: transfers are evaluated at finish or early termination, released after 72 h or both ratings (`JobSettlementService.release_eligible?`), via the existing `payments:release_eligible` cron. P3 adds **no biweekly technician payouts**. What P3 changes for rolling jobs is only *what makes a due payout eligible* and *how a shortfall is covered*. Legal compliance of the finish-based schedule for long multi-period jobs is verified separately (§18).

### 12.4 `Funding::RollingTransferPolicy` (used by `PaymentService` only when `funding_mode == rolling_two_week`)

Preserved protections (identical to today): technician snapshot present; Connect account `payout_ready`; no pending refunds; no blocking `PaymentRiskEvent`; no `processing` collection **allocated to a period whose work is included in this payout** (a processing collection for a *future* or voided period does not block paying earned hours, because the cap below already excludes it); idempotency key per transfer; 23 h outcome-unknown discipline; `TransferRetryAuthorization` for admin retries; `source_transaction` decision unchanged (`platform_balance` for multi-charge jobs).

Replaced protection: instead of whole-job `fully_funded`, a **labor-available** cap. Not every collected dollar is transferable: each company collection prepays **labor and TechFlash fees**, and the fee portion is never technician money.

```
eligible_labor_funded     = Σ_k labor_allocated_cents(k)                      # labor portion of VERIFIED cash allocated to periods whose
                                                                              # work is included in this payout (§6.2); fee portion excluded;
                                                                              # periods with a processing/returned/disputed collection excluded
holds                     = reserved_refund_cents + reserved_transfer_cents   # existing helpers: pending refunds, in-flight transfers
                          + risk_holds (blocking PaymentRiskEvent amounts) + platform_obligations_against_these_funds
available_technician_funds = eligible_labor_funded − Σ prior company-funded technician transfers (this job) − holds
stripe_constraint         = spendable platform balance for THIS job's funds:
                              Stripe available balance − Σ reservations for other jobs' pending transfers/refunds − platform fee retention
                              (never the raw Stripe "available balance")
due_entitlement           = entitled_cents (unpaid)
company_funded_transfer   = max(0, min(due_entitlement, available_technician_funds, stripe_constraint))
shortfall                 = due_entitlement − company_funded_transfer                                  # ≥ 0
```

- `company_funded_transfer > 0` → `technician_transfer` with key `tf_job_<id>_txn_technician_transfer_r<rev>_s<settlement_sequence>` (the existing "one transfer per job" guard becomes "one transfer per settlement sequence"; `settlement_sequence` increments on each settlement event — finish, early termination, pause-deadline termination).
- `shortfall > 0` → **not** blocked indefinitely and **not** forgotten: a `technician_compensation_obligations` row (`amount_cents = shortfall`, `reason`, `due_at = release_eligible_at`) records the debt owed to the technician (§12.6). It is the company's debt; TechFlash's handling of it is D-13 (open).
- `stripe_constraint` is computed by `Funding::PlatformBalanceReservations` from our own ledger of pending outbound transfers/refunds across **all** jobs plus the fee retention policy. Stripe's reported available balance is an upper bound only; it includes other companies' prepaid periods and TechFlash's fees and is **never** treated as money TechFlash may spend on this job.
- Invariants checked in tests, at all times per job: Σ company-funded technician transfers ≤ Σ labor portion of verified allocated cash − refunds; and Σ company-funded transfers across all jobs ≤ Σ labor portions across all jobs (no cross-job borrowing).

### 12.5 `Funding::RollingSettlement` (replaces `settle!` for rolling jobs)

1. Compute `consumed` (approved pay lines + company %) vs allocated across all periods; attempt the final collection for any company shortfall (`final_hours_top_up`, existing idempotency) and the refund of remaining credit (`period_funding_refund`, D-6).
2. Compute technician entitlement and run `RollingTransferPolicy` **independently of step 1's outcome**: a failed or processing final collection does not block the company-funded portion already available, and the shortfall becomes an open obligation.
3. `settlement_status`: `settled` when entitlement is fully transferred from company funds and no receivable is open; **new** `settled_with_obligation (4)` when an open `technician_compensation_obligation` and a `company_receivables` row exist (the technician is still owed money; recovery from the company is in progress); `settlement_blocked` only for legacy reasons (missing snapshot, disputes).

### 12.6 Obligations when company funds are unavailable — recorded debt; platform reserve is OPEN (D-13 not approved)

What P3 designs now (independent of D-13):

- `technician_compensation_obligations`: `job_id`, `technician_profile_id`, `amount_cents`, `reason` (`final_collection_failed`, `ach_return_after_work`, `pause_deadline_termination`, `override_approved_hours`), `status` (`open → company_recovered | written_off`, with `authorized → paid` reachable **only** after D-13 is decided), `paid_transaction_id`, timestamps. An obligation is an auditable record that compensation is **owed** to the technician; nothing in P3 extinguishes it — not an insufficient or non-existent reserve, not a company default, not a write-off of the company receivable.
- Recovery from the company: `company_receivables` (`company_profile_id`, `job_id`, `obligation_id`, `amount_cents`, `status open → collecting → recovered | written_off`, `last_collection_attempt_at`), collected by on-session or (authorized) off-session collection (`transaction_type: receivable_recovery`) — **never** from the technician. A recovered receivable is verified cash: it is allocated as labor-funded cash to the obligation's job, and the normal `RollingTransferPolicy` then pays the technician from it (the obligation moves to `company_recovered`). Companies with open receivables cannot publish new priced jobs until recovered (`publish_blocked_receivable`).
- Admin dashboard: open obligations, age, company recovery status; owner-visible report of total outstanding technician compensation not yet covered by company cash.

What is **not** designed as enabled (D-13 OPEN / NOT APPROVED, §20):

- No platform compensation reserve exists in P3. No reserve amount, no reserve funding source, no reserve ledger balance and no capital commitment of any size is proposed as approved; the owner has not authorized any.
- `reserve_technician_transfer` and `reserve_backing` are **reserved enum values only**; no code path may execute them. Live reserve-funded compensation transfers stay **disabled** (`rolling_funding_reserve_transfers_enabled` does not exist as a settable flag in P3 — the policy returns "not available" unconditionally) until the owner explicitly decides D-13 in the future.
- Design constraints the eventual D-13 decision must respect, recorded so later work does not drift: any reserve would be TechFlash capital, segregated in its own ledger and **never** sourced from customer prepaid balances or other jobs' allocated cash; reserve disbursements would be capped by `min(authorized obligation, reserve ledger balance, stripe_constraint)` — never by Stripe's raw available balance; zero automatic authorization; manual audited approval per obligation; payment rail appropriate to worker classification (Stripe Connect only where appropriate; compliant payroll for W-2 if counsel so classifies); and an insufficient reserve never extinguishes owed compensation.

### 12.7 What P3 explicitly does not do

No transfer reversals, no clawbacks from technicians, no wage deductions for company failures (R9); no mid-job refunds of credit; no changes to `TRANSFER_IDEMPOTENCY_SAFE_WINDOW`, admin reconcile endpoints or legacy gates; no payout-schedule change (R10); no reserve funding or reserve-funded transfers (D-13 open).

---

## 13. HSI / waiver compatibility and legacy migration

### 13.1 Facts

- Company #8 (HSI): `job_funding_waived: true`; jobs #32–38 `funding_status: funded` with zero collections (P2 dry-run proposes → `unfunded` + marker; owner-authorized run pending); jobs #28–31 have real succeeded collections.
- Company #19: completed a live **bank-linking pilot only** — SetupIntent + ACH mandate were created; **zero PaymentIntents / charges** were made. It is not evidence of an ACH collection cycle. Global ACH remains OFF.

### 13.2 `funding_mode` backfill (data migration, no money movement)

| Existing job | `funding_mode` | Periods / outbox |
|---|---|---|
| Any job with ≥ 1 succeeded collection (incl. HSI 28–31) | `whole_job_upfront` | none |
| `posted_under_funding_waiver: true` with no collections (HSI 32–38 after reclassification) | `legacy_exempt` | none — **never auto-debited** |
| Unpriced | `whole_job_upfront` (vacuously funded) | none |
| Drafts | NULL until publish | — |
| `legacy_funded_without_collections?` rows without the marker (Category B) | NULL + admin case | none; blocked from authorization until resolved |

Planner and runner refuse to create periods or collections for `whole_job_upfront` / `legacy_exempt`.

### 13.3 HSI legacy jobs (D-11 approved)

- **Posting visibility is grandfathered**: jobs stay `open`/claimable exactly as P2 leaves them.
- **Funding is required before new work.** Once enforcement is on (Phase C), `Funding::WorkAuthorization` returns false for `legacy_exempt` jobs; no activation, start-work, new time entries or approvals for new dates. Previously approved hours are untouched.
- **Never auto-debit**: the only ways a legacy job acquires authorization are deliberate: (a) company converts to rolling funding (two-step, §13.5), (b) company pays the whole job on-session via the existing publish/`confirm_funding`-style path, or (c) admin records a **time-bounded, audited work-authorization override** (`admin_work_authorization_override_until`, reason, approver) — this is an explicit decision that creates platform exposure and is reported on the admin dashboard; it is not the default.
- Before Phase C is enabled, `rake funding:legacy_exempt_report` (read-only) lists each `legacy_exempt` job with claim status, last time entry and hours pending, so the owner can make the per-job decision in advance and no technician is surprised.

### 13.4 Waiver semantics after P3

`company.job_funding_waived` keeps meaning "may publish without paying". It never grants work authorization.

### 13.5 Explicit opt-in conversion

1. Admin `POST /api/v1/admin/jobs/:id/funding/propose_rolling_conversion` → audit row + company notification.
2. Company (on-session) `POST /api/v1/jobs/:id/funding/accept_rolling_conversion` with explicit recurring-charge consent → `funding_mode: rolling_two_week`, periods planned from the next working day, period 1 collected **on-session now** (card with 3DS; ACH only with fresh recurring mandate acknowledgement and the ACH lead-time warning), later periods scheduled. `posted_under_funding_waiver` is preserved for history.

---

## 14. API, frontend and admin changes (not implemented)

### 14.1 Serializer additions

`payment_summary` gains `funding_mode`, `work_authorized_through_on`, `work_authorization: {authorized_now, reason}`, `paused_at/paused_on/pause_reason`, `current_period {sequence, dates, status, required_cents, allocated_cents, consumed_cents}` (amounts company/admin only), `next_collection {run_at, amount_cents, payment_method_type, status}`, `funding_periods[]` (company/admin), `start_at_risk`, `coverage_exceeded`, `open_receivable` (admin).

### 14.2 Endpoints

| Route | Actor | Purpose |
|---|---|---|
| `GET /api/v1/jobs/:id/funding_periods` | company/admin/tech (reduced) | Plan and statuses |
| `POST /api/v1/jobs/:id/funding_periods/:sequence/pay_now` | company | On-session card payment for a failed/at-risk/`requires_action` period (returns `client_secret`) |
| `POST /api/v1/jobs/:id/funding/accept_rolling_conversion` | company | §13.5 |
| `POST /api/v1/admin/jobs/:id/funding/propose_rolling_conversion` | admin | §13.5 |
| `POST /api/v1/admin/jobs/:id/funding/pause` / `resume` | admin | Manual; resume only if current period funded |
| `POST /api/v1/admin/jobs/:id/funding/work_authorization_override` | admin | Time-bounded, audited (§13.3) |
| `GET /api/v1/admin/funding/scheduler` | admin | §8.6 health |
| `POST /api/v1/admin/funding/collections/:id/retry` / `reconcile` | admin | Re-queue exhausted row; resolve `needs_admin_reconciliation` |
| `GET /api/v1/admin/funding/obligations` | admin | Open technician compensation obligations and company recovery status (§12.6). No `authorize`/pay action exists in P3 (D-13 open). |
| `GET /api/v1/admin/funding/receivables` | admin | Company receivables |
| `POST /api/v1/internal/funding/run_due_collections` | cron secret | Fallback trigger |
| `PUT /api/v1/admin/rolling_funding_settings/global` / `companies/:id` | admin | Flags (mirrors `admin/ach_settings`) |

### 14.3 Frontend (described only)

- `CreateJob` / `EditJob`: "You'll be charged **$X now** for <dates>; later periods are charged automatically N days before they start" + recurring-charge consent; `termsLocked` includes `partially_funded`.
- Claim result / `JobDetail`: authorization banner ("Work authorized through <date>" / "Not authorized — awaiting funding" / "Paused"); for `start_at_risk` exempt jobs the company sees exactly **Pay now by card** or **Propose a later start** — no other path.
- Time-entry panel disables dates not authorized, with reason.
- Admin: scheduler health card, reconciliation queue, obligations/receivables, legacy-exempt decision list, pause/resume/override with reasons.
- `jobStatus.js`: add `awaiting_funding`, `paused`.

---

## 15. Minimum data model

DDL for clarity only — **no migration is created by this PR**.

```sql
ALTER TABLE jobs
  ADD COLUMN funding_mode integer,                               -- 0 whole_job_upfront, 1 rolling_two_week, 2 legacy_exempt
  ADD COLUMN work_authorized_through_on date,
  ADD COLUMN paused_at timestamp, ADD COLUMN paused_on date, ADD COLUMN pause_reason varchar,
  ADD COLUMN admin_work_authorization_override_until date,
  ADD COLUMN settlement_sequence integer NOT NULL DEFAULT 0;
-- funding_status gains partially_funded = 4; settlement_status gains settled_with_obligation = 4

CREATE TABLE job_funding_periods (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES jobs, sequence integer NOT NULL,
  period_start_on date NOT NULL, period_end_on date NOT NULL,
  scheduled_working_days integer NOT NULL, scheduled_hours numeric(8,2) NOT NULL,
  labor_cents integer NOT NULL, company_required_cents integer NOT NULL, tech_payout_target_cents integer NOT NULL,
  pending_adjustment_cents integer NOT NULL DEFAULT 0, financial_revision integer NOT NULL,
  status varchar NOT NULL DEFAULT 'planned', planned_payment_method_type varchar,
  collection_initiate_at timestamp, funding_due_at timestamp NOT NULL,
  funded_at timestamp, failed_at timestamp, voided_at timestamp, void_reason varchar,
  created_at timestamp NOT NULL, updated_at timestamp NOT NULL, UNIQUE (job_id, sequence));
CREATE INDEX ON job_funding_periods (status, funding_due_at);

CREATE TABLE job_funding_allocations (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES jobs,
  job_funding_period_id bigint REFERENCES job_funding_periods,      -- NULL = credit pool
  source_type varchar NOT NULL, source_id bigint NOT NULL, amount_cents integer NOT NULL,
  reason varchar, created_by_type varchar, created_by_id bigint, created_at timestamp NOT NULL,
  UNIQUE (source_type, source_id, job_funding_period_id));
CREATE INDEX ON job_funding_allocations (job_id, job_funding_period_id);

CREATE TABLE scheduled_funding_collections (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES jobs,
  job_funding_period_id bigint NOT NULL REFERENCES job_funding_periods,
  job_payment_transaction_id bigint REFERENCES job_payment_transactions,
  kind varchar NOT NULL,                      -- deferred_initial | replenishment | true_up | adjustment | retry | manual
  run_at timestamp NOT NULL, status varchar NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
  lease_until timestamp, locked_by varchar,
  stripe_request_started_at timestamp, stripe_payment_intent_id varchar,
  idempotency_key varchar NOT NULL UNIQUE, amount_cents integer NOT NULL,
  last_error_code varchar, last_error_message text, last_attempted_at timestamp,
  created_at timestamp NOT NULL, updated_at timestamp NOT NULL);
CREATE INDEX ON scheduled_funding_collections (status, run_at);
CREATE INDEX ON scheduled_funding_collections (status, lease_until);

CREATE TABLE funding_scheduler_runs (
  id bigserial PRIMARY KEY, started_at timestamp NOT NULL, finished_at timestamp, host varchar,
  trigger varchar, rows_leased integer, rows_succeeded integer, rows_failed integer, rows_reconciled integer,
  hit_runtime_limit boolean NOT NULL DEFAULT false, error text);

CREATE TABLE technician_compensation_obligations (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES jobs, technician_profile_id bigint NOT NULL,
  amount_cents integer NOT NULL, reason varchar NOT NULL, status varchar NOT NULL DEFAULT 'open',
  due_at timestamp, authorized_by_admin_id bigint, authorized_at timestamp,
  paid_transaction_id bigint REFERENCES job_payment_transactions, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);

CREATE TABLE company_receivables (
  id bigserial PRIMARY KEY, company_profile_id bigint NOT NULL, job_id bigint NOT NULL REFERENCES jobs,
  obligation_id bigint REFERENCES technician_compensation_obligations,
  amount_cents integer NOT NULL, status varchar NOT NULL DEFAULT 'open', last_collection_attempt_at timestamp,
  recovered_transaction_id bigint, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);

ALTER TABLE job_payment_transactions
  ADD COLUMN job_funding_period_id bigint REFERENCES job_funding_periods,
  ADD COLUMN scheduled_funding_collection_id bigint REFERENCES scheduled_funding_collections;
-- transaction_type gains period_funding_charge = 10, period_funding_refund = 11, reserve_technician_transfer = 12 (reserved; not executable until D-13)
-- job_funding_allocations.source_type ∈ collection | refund | credit_transfer (reserve_backing reserved, unused until D-13); no adjustment type

ALTER TABLE company_profiles
  ADD COLUMN rolling_funding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN recurring_charge_authorized_at timestamp, ADD COLUMN recurring_charge_authorization_version varchar,
  ADD COLUMN publish_blocked_receivable boolean NOT NULL DEFAULT false;

-- platform_settings rows: rolling_funding_enabled, rolling_funding_enforcement_enabled, rolling_funding_scheduler_enabled,
--   rolling_funding_auto_pause_enabled, rolling_funding_ach_enabled, rolling_funding_card_lead_days (3), rolling_funding_ach_lead_days (7),
--   rolling_funding_pause_settlement_days (7). No reserve settings (amount, cap, auto-authorization) exist in P3 — D-13 open.
```

Pause history reuses `job_term_change_audits` (D-8) unless its mutability audit fails.

---

## 16. Test matrix (summary)

Full matrix: `docs/ROLLING_FUNDING_TEST_MATRIX.md`. Groups: period planning; allocation and pool credit; publish; claim (24 h rule, start-at-risk options); scheduler leasing/bounds/reconciliation; webhooks; work authorization at every entry point; pause/resume/deadline; rolling transfer policy (labor-available cap), settlement, obligations and receivables (reserve paths asserted disabled); legacy/HSI decisions; API/admin; staging E2E; SQLite-CI compatibility (Postgres-only constructs adapter-guarded, plus a Postgres CI job).

---

## 17. Rollout phases and feature flags

### 17.1 Flags (none reuse `ACH_GLOBAL_DISABLED` / `ach_payments_globally_enabled`)

| Flag | Scope | Default | Effect |
|---|---|---|---|
| `ROLLING_FUNDING_DISABLED` (ENV) | global kill switch | unset | Planner, runner, auto-pause exit; enforcement stays as configured (safety never turns off with the kill switch) |
| `rolling_funding_enforcement_enabled` | global | false | `Funding::WorkAuthorization` enforced for `rolling_two_week` and `legacy_exempt` jobs |
| `rolling_funding_enabled` | global | false | New publishes may use `rolling_two_week` (AND company flag) |
| `rolling_funding_scheduler_enabled` | global | false | Runner executes outbox rows (else dry-run) |
| `rolling_funding_auto_pause_enabled` | global | false | Due-date pauses applied (else alerts) |
| `rolling_funding_ach_enabled` | global | false | ACH period charges (AND `AchAccess`) |
| `company_profiles.rolling_funding_enabled` | company | false | Pilot opt-in |
| lead days / pause deadline | global | 3 / 7 / 7 | tunables |
| reserve-funded transfers | — | **none** | no flag exists; `RollingTransferPolicy` reports reserve unavailable until the owner decides D-13 |

Hard rule enforced in code: `rolling_funding_enabled` cannot be turned on while `rolling_funding_enforcement_enabled` is off (setting endpoint refuses; runner re-checks).

### 17.2 Phases — enforcement before activation

| Phase | Content | Flags | Exit criteria |
|---|---|---|---|
| **A — Docs** | This proposal; decisions recorded. | — | Approved. |
| **B — Schema + models** | Tables/columns, enums, `funding_mode` backfill, planner & allocator as pure services, serializers read-only. No behaviour change. | all off | Backfill verified: 0 periods/outbox rows; every job has a mode; `legacy_exempt_report` reviewed by owner. |
| **C — Enforcement + pause/resume** | `WorkAuthorization` at every entry point, `PeriodStateService`, pause/resume/deadline, admin override/pause tools, notifications. Verified in staging, then **enabled in production** (at this point affects `legacy_exempt` jobs per D-11 and any priced `whole_job_upfront` job whose whole-job collection has not actually succeeded — normally none, since unfunded priced jobs are not claimable; no rolling jobs exist yet). | `enforcement_enabled` on | Staging scenario: unfunded date refused at every entry point; pause → pay_now → resume; deadline termination settles. Prod: HSI decisions applied; `rake funding:legacy_exempt_report` also lists any claimed whole-job job lacking verified funding (expected empty); no regressions on verified-funded `whole_job_upfront` jobs. |
| **D — Scheduler dry-run + reconciliation** | Railway cron service created (owner dashboard action); runner, reconciler, monitoring live in dry-run; staging E2E with Stripe test keys. Can run in parallel with C but must finish before E. | `scheduler_enabled` off | 7 days of heartbeats, zero stuck rows, reconciliation drills (kill runner mid-Stripe in staging) pass. |
| **E — Pilot rolling publish (card)** | `rolling_funding_enabled` + one pilot company; auto-pause **on from day one**; rolling transfer policy, obligation and receivable recording live; **no reserve-funded transfers** (D-13 open). | enabled, scheduler on, pause on, ach off | ≥ 2 multi-period jobs replenished; one induced decline → pause → pay_now → resume; settlement and payout verified; allocations verified. |
| **F — ACH periods** | After mandate copy update and counsel sign-off (§18 blockers). | `ach_enabled` for pilot | One ACH cycle end-to-end (≥ 4 business days). |
| **G — GA + conversions** | Company flag default on for new companies; HSI conversion proposals only on explicit company request. | all on | Legacy jobs still untouched unless converted. |

Rollback at any phase = flip the relevant flag; outbox rows stay pending; enforcement is never relaxed by rollback.

---

## 18. Legal and financial risks (open counsel questions — pre-launch blockers for the affected features)

| Area | Risk | Mitigation in design | Blocks |
|---|---|---|---|
| ACH mandate scope | Current copy excludes recurring variable debits; Nacha requires authorization matching the debit pattern | Copy revision + `recurring_charge_authorized_*`; advance notice of amount/date | Phase F |
| Card MIT rules | Off-session recurring/unscheduled charges need cardholder agreement | Explicit consent at publish/conversion; `off_session: true` | Phase E |
| Nacha reinitiation / NSF | ≤ 2 reinitiations within 180 days | No automatic ACH retry (D-7) | Phase F |
| ACH return/dispute after work | Funds leave after period consumed (returns ≤ 4 business days; disputes ≤ 60 days personal) | `PaymentRiskEvent` blocks company-funded transfers; technician entitlement recorded as obligation; company receivable; reserve advance only if D-13 is later approved | Phase F |
| Holding advance funds | Platform balance holds one period ahead; refunds of unused credit | Connect structure review | Phase E |
| Texas Payday Law / classification | If W-2 non-exempt, semi-monthly pay required; finish-based payout for long jobs may not comply | Payout schedule unchanged in P3 (D-10); compliance verified separately; reserve rail could become payroll (D-13) | Phase E (verification), not a design change |
| Wage deductions | None for company failures | No deduction path | — |
| Reserve as credit extension | Platform paying technicians on a company's behalf would be a receivable; terms must permit recovery | Receivable terms; publish block; no reserve enabled until D-13 | D-13 |
| Pause / termination for non-payment | Technician reliance; no fee in P3 (D-12) | Clear notices; separate fee policy after legal review | — |
| Data | Masked payment-method data only | Unchanged | — |

---

## 19. PR sequence (enforcement precedes activation)

| # | Branch | Content | Depends on | Size |
|---|---|---|---|---|
| PR-0 | `cursor/rolling-two-week-funding-architecture-6cf6` | This docs-only proposal (draft). | — | docs |
| PR-1 | `p3/funding-data-model` | Migrations for all §15 tables/columns, enums, `funding_mode` backfill (no money), models, `verify_allocations` rake, `legacy_exempt_report` rake. | main (P2 merged) | M |
| PR-2 | `p3/period-planner-and-allocator` | `Funding::PeriodPlanner`, `Funding::Allocator`, `JobMoney` helpers, read-only serializer fields. | PR-1 | M |
| PR-3 | `p3/work-authorization-and-pause` | `Funding::WorkAuthorization` wired into every entry point (§7.4), `PeriodStateService`, pause/resume/deadline, admin override/pause/resume endpoints, notifications, `rolling_funding_enforcement_enabled`. | PR-2 | L |
| PR-4 | `p3/collection-runner-and-reconciler` | Outbox runner (bounded, leased), `CollectionReconciler`, `funding_scheduler_runs`, rake + internal trigger, admin scheduler/reconciliation endpoints, `CRON_JOBS.md`/`RAILWAY_SETUP.md` docs for the cron service; dry-run default. | PR-2 | L |
| PR-5 | `p3/rolling-transfer-policy-and-obligations` | `RollingTransferPolicy` (labor-available cap, `PlatformBalanceReservations`), `RollingSettlement`, obligations, receivables and recovery, admin obligation list; `PaymentService`/`JobSettlementService` branch by `funding_mode` (legacy paths untouched, covered by regression tests). No reserve transfer code path (D-13 open). | PR-3 | L |
| PR-6 | `p3/publish-claim-integration` | Period-1 at publish, replenishment scheduling, exempt-claim deferred collection (24 h rule), `start_at_risk` options, webhook period handling, `partially_funded`, true-ups, cancel/void/processing resolver. **Flag flip requires PR-3 verified in production.** | PR-3, PR-4, PR-5 | L |
| PR-7 | `p3/frontend` | §14.3. | PR-6 API | L |
| PR-8 | `p3/ach-period-charges` | ACH lead-time path, mandate copy, `rolling_funding_ach_enabled`. | PR-6, counsel | S |
| PR-9 | `p3/legacy-conversion` | Two-step conversion endpoints/UI. | PR-6 | M |
| PR-10 | `p3/hardening` | Staging E2E extension, `payments:diagnose` period rows, Postgres CI job, runbook. | all | S |

---

## 20. Decisions

### A — Owner-approved business rules

R1–R10 (§3).

### B — Architect defaults, approved by owner

| ID | Decision |
|---|---|
| D-1 | Periods are 14 calendar days. |
| D-2 | Periods are job-start-relative and recalculated on claim. |
| D-3 | Jobs ≤ 14 days use a single period (today's behaviour). |
| D-5 | Card initiate T−3 d, ACH T−7 d, both shifted earlier for weekends/US bank holidays so banking-day lead is preserved. |
| D-7 | No automatic ACH retry after a definitive failure. |
| D-8 | Reuse `job_term_change_audits` for immutable pause history (fallback: `job_pause_events` if mutability audit fails). |
| D-10 | No payout-schedule change in P3; legal compliance verified separately. |

### C — Owner decisions, approved (Ethan, via coordinator)

| ID | Decision |
|---|---|
| D-4 | Additional approved hours are billed in the next funding cycle, with an immediate top-up if coverage would otherwise be exceeded (§10.3). |
| D-6 | Unused prepaid funds carry forward; remaining credit is reconciled and refunded at job completion (§10.4). |
| D-9 | After a funding pause the original dates are kept unless company and technician agree to reschedule (§11.3). |
| D-11 | HSI legacy jobs #32–38: posting visibility grandfathered; funding required before new work; legacy jobs never auto-debited (§13.3). |
| D-12 | No new cancellation/standby fee in P3; separate policy after legal review (§11.4). |

### D — Open / not approved

| ID | Question | Status |
|---|---|---|
| D-13 | Whether TechFlash will operate a platform compensation reserve to advance technician compensation that a company failed to fund (§12.6): funding source, amount, exposure cap, authorization and payment rail. | **OPEN — NOT APPROVED.** The owner has not authorized any reserve, any reserve amount, any reserve funding or any capital commitment. Nothing reserve-related is designed as enabled: no settings, no authorize/pay action, no executable `reserve_technician_transfer` / `reserve_backing` path. Live reserve-funded compensation transfers stay disabled until the owner explicitly decides D-13 in the future. P3 records unfunded entitlement as open obligations with company receivables; an obligation is never extinguished by the absence of a reserve. Constraints any future decision must respect are listed in §12.6. |

Counsel questions in §18 remain open and block the phases listed there.

---

### Appendix — What this PR does not change

Only files under `docs/` are modified. No migrations, schema, code, scheduler, worker, payment service, frontend, Stripe object, Railway/Vercel configuration, ACH flag, production row, or the merged P2 code were created or changed.
