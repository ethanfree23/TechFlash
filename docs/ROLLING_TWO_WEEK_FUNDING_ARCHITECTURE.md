# Rolling Two-Week Job Funding (P3) — Architecture Proposal

**Status:** DRAFT — design and documentation only. No application code, migrations, schema, scheduler, payment-service, frontend, Stripe, Railway/Vercel, or production-data changes accompany this document.

**Base:** `origin/main` @ `81e139e`. Written against the code on that commit; where the P2 branch (`cursor/posting-funding-exemption-9327`, PR #32) changes behaviour, the difference is called out explicitly. P3 is layered **on top of** P2 and never replaces it.

**Companion documents:**

- `docs/ROLLING_FUNDING_STATE_MACHINE.md` — the five state concepts, transition tables and the funding-period / scheduled-collection state machines.
- `docs/ROLLING_FUNDING_TEST_MATRIX.md` — test matrix for every behaviour described here.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Current code audit](#2-current-code-audit)
3. [Approved business requirements](#3-approved-business-requirements)
4. [Recommended architecture](#4-recommended-architecture)
5. [Two-week funding calculation](#5-two-week-funding-calculation)
6. [Funding-period data model](#6-funding-period-data-model)
7. [Posting, claim and start state machines](#7-posting-claim-and-start-state-machines)
8. [Durable scheduler recommendation](#8-durable-scheduler-recommendation)
9. [Card vs ACH lead times](#9-card-vs-ach-lead-times)
10. [Automatic replenishment](#10-automatic-replenishment)
11. [Pause / resume](#11-pause--resume)
12. [Ledger and payout safety](#12-ledger-and-payout-safety)
13. [HSI / waiver compatibility and legacy migration](#13-hsi--waiver-compatibility-and-legacy-migration)
14. [API, frontend and admin changes](#14-api-frontend-and-admin-changes)
15. [Minimum data model](#15-minimum-data-model)
16. [Test matrix (summary)](#16-test-matrix-summary)
17. [Rollout phases and feature flags](#17-rollout-phases-and-feature-flags)
18. [Legal and financial risks](#18-legal-and-financial-risks)
19. [PR sequence](#19-pr-sequence)
20. [Owner decisions](#20-owner-decisions)

---

## 1. Executive summary

TechFlash today funds a job **once, in full, at publish time** (`JobFundingService.fund_for_publish!` charges `Job#company_charge_cents` for the whole schedule). The owner has approved moving to **rolling two-week funding**: a normal posting funds only the first two weeks of scheduled work, each later two-week period is funded in advance with lead time, funding failure pauses the job (never erasing compensation for hours already worked), and admin "posting exemptions" allow publication only — never work authorization, never a waiver of payment, never an automatic debit.

This proposal recommends:

- **Period model.** A new `job_funding_periods` table splits the job's working schedule (via the existing `Schedule::WorkingIntervalExpander`) into consecutive 14-calendar-day windows anchored at the job's effective `scheduled_start_at` in `job_timezone`. Period 1 is the only thing collected at publish. Jobs of ≤ 14 calendar days have exactly one period and behave exactly as today.
- **Durable scheduling.** A Postgres **outbox** table (`scheduled_funding_collections`) holds every future collection as a row with `run_at`, lease columns, attempt counters and a deterministic Stripe idempotency key. A rake task (`funding:run_due_collections`) scans due rows with `FOR UPDATE SKIP LOCKED` and is triggered by **Railway Cron every 15 minutes** (plus an HTTP trigger behind a cron secret — the same pattern already documented for `payments:release_eligible`). This is "Option B's durability with Option A's trigger"; a managed Active Job adapter (Option C) is recorded as a later upgrade path, not a prerequisite.
- **Separate truths.** Five independent concepts are made explicit and never conflated: posting visibility, claim eligibility, funding (cash verified), work authorization (may hours be logged *today*), and operational state (active / paused / ended). `JobLedger` keeps its whole-job definitions; a new **period projection** answers "is the current period funded?" without touching the payout gates in `PaymentService.release_to_technician`.
- **Payout schedule unchanged.** Technician transfers stay at finish/72h/both-ratings, still gated on succeeded collections, still capped at `net_funded_cents`. Pause never claws back or reverses.
- **Legacy & HSI.** Every existing job gets `funding_mode: whole_job_upfront` (or `legacy_exempt` for waived HSI jobs #32–38). No existing job is ever auto-debited; conversion to rolling funding is an explicit, audited, company-authorized opt-in.
- **Flags.** New `PlatformSetting` keys (`rolling_funding_enabled`, `rolling_funding_scheduler_enabled`, `rolling_funding_auto_pause_enabled`, `rolling_funding_ach_enabled`) plus a company-level flag and an ENV kill switch, all distinct from the ACH kill switch.

Nine PRs are proposed (§19). Twelve owner decisions are listed in §20 with defaults so implementation can proceed without blocking.

---

## 2. Current code audit

All references are to `skilled_hub_api/` on `main@81e139e` unless marked **[P2]**.

### 2.1 Funding at publish is whole-job and immediate

| Where | What it does today | Consequence for P3 |
|---|---|---|
| `app/services/job_funding_service.rb:69` `fund_for_publish!` | Charges `job.company_charge_cents` (whole schedule) via `collect!(transaction_type: :initial_job_charge)`. Waived or unpriced jobs (`!job.priced? \|\| job.job_funding_waived?`, lines 79–82) are stamped `status: :open, funding_status: :funded` with **no** collection. | Needs a period-aware amount (period 1 only). **[P2]** already splits the waived branch to `funding_status: :unfunded, posted_under_funding_waiver: true`; P3 must build on that. |
| `app/services/job_funding_service.rb:167` `collect!` | Locks the Job row, enforces the ACH fail-closed gate, derives the idempotency key `tf_job_#{job.id}_txn_#{transaction_type}_r#{revision}_#{amount}` (line ~183 lookup / ~209, ~244 write), calls `JobStripeOps.create_payment_intent!` with `off_session: true, confirm: true`. Reuses an existing `JobPaymentTransaction` with the same key. | Reusable as-is for period charges if a `job_funding_period_id` and a new transaction type are threaded through. The key must gain the period sequence or two periods with the same amount in the same revision collide. |
| `app/services/job_funding_service.rb:118` `confirm_requires_action!` / `:152 apply_successful_intent!` / `:279 publish!` | 3DS confirmation path; a succeeded PI publishes the job. | Period-1 publish path unchanged; later periods must **not** call `publish!`. |
| `app/services/job_funding_service.rb:309` `default_payment_method_id` | Customer default → first card → first `us_bank_account`. | Scheduler needs a deterministic, auditable "payment method to use for off-session period charges" with lead time dependent on the type. |
| `app/services/job_stripe_ops.rb:73` `create_payment_intent!` | `off_session` default true, `confirm: true`; ACH forces `payment_method_types: ["us_bank_account"]`, cards use `automatic_payment_methods` with `allow_redirects: never`. | Good fit for merchant-initiated recurring charges; needs `metadata` to carry `job_funding_period_id` and `scheduled_funding_collection_id` so webhooks can route. |
| `app/controllers/api/v1/jobs_controller.rb:147` `create` and `:766 finalize_publish_funding!` (used by `update` at `:246`) | `needs_funding = priced && !waived`; otherwise `snapshot_company!` + `funding_status: :funded` (lines 235 and 798). | **[P2]** corrects the waived stamp. P3 adds `funding_mode` selection and period generation here. |
| `app/controllers/api/v1/jobs_controller.rb:753` `enforce_card_for_publish!` | Requires a payment method before publication for non-waived priced jobs. | Retained; extended to validate the method is usable for recurring off-session use (card: `setup_future_usage`/SetupIntent `off_session`; ACH: active mandate). |

### 2.2 Claim and work-start do not check funding beyond `funding_funded?`

| Where | Today | Gap |
|---|---|---|
| `app/services/jobs/claim_job_service.rb:83` | `unless @job.funding_funded? \|\| !@job.priced? \|\| @job.job_funding_waived?` → claim blocked. **[P2]** becomes `funding_allows_claim? \|\| job_funding_waived?`. | Claim must also trigger the **deferred first-period collection** for exempt-posted jobs (24-hour rule) and must snapshot the period plan for rolling-start jobs once `ensure_schedule_for_start_mode!` (`:210`) resolves `scheduled_start_at`. |
| `app/services/jobs/claim_job_service.rb:109` `create_claim_atomically!` | Job row lock; sets `status: :filled` at capacity. | The outbox row for the deferred collection should be inserted inside this transaction so it is durable the instant the claim commits. |
| `app/models/concerns/job_effective_status.rb:82` `effective_status` | Returns `"active"` when claimed and `scheduled_start_at <= now` (line 88). No funding or pause check. | Needs a `"paused"` effective status driven by work authorization. |
| `app/controllers/api/v1/time_entries_controller.rb:95` `closed_to_new_time_entries_reason` | Allows time entries only on `reserved`/`filled`; no funding check. | Work authorization gate must be inserted here (date-aware so pre-pause dates remain submittable). |
| `app/services/time_entries/policy_validator.rb`, `app/services/compensation/calculator.rb` | Pay lines computed per entry from job terms (overtime, weekend multipliers). | Unchanged; period consumption is derived from approved `TimeEntryPayLine`s grouped by work date. |

### 2.3 No durable deferred execution exists

- `config/environments/production.rb:72`, `staging.rb:31`, `demo.rb:27`: `config.active_job.queue_adapter = :inline`. No Sidekiq, GoodJob, SolidQueue, Redis or cron gem in `Gemfile`.
- `app/controllers/api/v1/stripe_webhooks_controller.rb:64` comment: "there is no durable job queue in this app: Active Job is inline".
- `skilled_hub_api/railway.json` has no cron; `CRON_JOBS.md` and `PAYMENTS_SETUP.md:103–115` document that `payments:release_eligible` must be scheduled in the Railway dashboard and may be triggered by `POST /api/v1/internal/payments/release_eligible` with `X-Payments-Cron-Secret` (`app/controllers/api/v1/internal_payments_controller.rb`, `app/services/payments_release_runner.rb`, `lib/tasks/payments.rake`).
- `lib/tasks/jobs_lifecycle.rake` + `app/services/jobs/auto_complete_expired_service.rb` are the second existing "scan and act" job.

Conclusion: any timer-based behaviour (24-hour deferred charge, T-minus lead-time replenishment, pause deadlines) must be **persisted rows scanned by a cron-triggered task**, not `perform_later`/`set(wait:)`.

### 2.4 Ledger and payout gates (`ledger.fully_funded` callers)

`JobLedger` (`app/services/job_ledger.rb:44 summary_for_labor`, `:72 fully_funded: due.zero?`) defines: `collected_cents` = succeeded `COLLECTION_TYPES`, `net_funded_cents` = collected − refunded, `company_required_cents` = labor + company %, `amount_due_cents` = required − net, `fully_funded` = due == 0. Labor for `actual_hours_worked` jobs is approved pay lines when finished else agreed labor (`:79 current_labor_cents`).

| Caller | Semantics needed | P3 impact |
|---|---|---|
| `app/services/payment_service.rb:94` (`release_to_technician`) | Whole-job: transfer only when every dollar owed is collected and succeeded. | **Unchanged.** Period collections are `COLLECTION_TYPES`, so a job whose periods were all collected is `fully_funded` at finish. Also retains `payout_amount > ledger.net_funded_cents` cap (`:155`). |
| `app/services/job_settlement_service.rb:45` and `:130` (`settle!`) | Whole-job at finish; collects shortfall as `final_hours_top_up`, refunds surplus, else `settlement_blocked`. | **Unchanged.** Settlement remains the final true-up; period true-ups reduce the size of the final delta. |
| `app/services/jobs/terminate_assignment_service.rb:236` | "settlement complete" = due 0 ∧ refundable 0 ∧ fully funded. | **Unchanged.** Termination already truncates the schedule (`truncate_schedule!`), which lowers `company_required_cents`; unfunded future periods must be **voided** (not collected) and already-collected unused period funds refunded through the existing refund paths. |
| `lib/tasks/payments.rake:36,38` (`payments:diagnose`) | Reporting. | Add period-aware rows; no gate change. |
| `app/serializers/job_serializer.rb:149` (`payment_summary`) | UI. | Add a `funding_periods` / `current_period` sub-hash (§14). |
| `lib/staging_ach_e2e_runner.rb` | Staging harness. | Extend for period charges in Phase C. |

`PaymentService.source_transaction_decision` already falls back to `platform_balance` when more than one succeeded charge exists, so multi-period jobs do not break `source_transaction` logic. `PaymentRiskEvent.blocking` (`app/models/payment_risk_event.rb:44`) already blocks transfers on post-success returns/disputes — a disputed period charge therefore blocks payout without new code.

### 2.5 Waiver / exemption paths (interaction with P2)

- `company_profiles.job_funding_waived` toggled by admin at `app/controllers/api/v1/admin/users_controller.rb:348`.
- `Job#job_funding_waived?` (`app/models/job.rb:~109`) delegates to the company.
- `JobFundingAdjustmentService.reconcile!` (`:28`) returns `:funded` for waived jobs without collecting.
- **[P2]** adds `jobs.posted_under_funding_waiver` (migration `20261111010000`), `Job#funding_allows_claim?`, sets waived publish to `funding_status: :unfunded`, and ships a dry-run-only `jobs:reclassify_waived_funding` rake. P3 relies on `posted_under_funding_waiver` as the "publication-only exemption" marker and adds the deferred collection on claim.

### 2.6 Other observations

- `jobs_controller.rb:508` `extend` only moves `scheduled_end_at`; no funding consequence. Under P3 an extension must regenerate future periods and schedule their collections.
- `Job#claim_capacity` = 1; period plan is per job, not per technician — fine today, revisit if capacity grows.
- `JobTermination` is unique per job and records `work_performed`; `TerminateAssignmentService` settles and refunds after commit — the natural home for voiding future periods.
- Webhooks: `payment_intent.succeeded/processing/payment_failed` locate the txn by PI id or `metadata.transaction_id` (`stripe_webhooks_controller.rb:618 find_locked_collection_txn`), with "failed after success" raising an investigation. Period charges reuse this path; the success handler must additionally mark the period funded and un-pause the job (and must **not** call `publish!` for sequence > 1).
- `AchAccess` (`app/services/ach_access.rb`) is fail-closed and must gate ACH period charges too; `ACH_PAYMENTS.md` decision 4 states the current mandate copy covers "posted jobs, counteroffer deltas, and settlement top-ups" — **not** recurring period debits (§18).
- Frontend touchpoints: `src/components/JobDetail.jsx:1183–1214` (payment summary copy keyed on `funding_status`), `src/pages/EditJob.jsx:220` (`termsLocked`), `src/pages/CreateJob.jsx:808–830` (3DS / processing handling), `src/pages/AdminJobPaymentsPage.jsx`, `src/components/CompanyPaymentMethodsPanel.jsx` (ACH mandate copy), `src/utils/jobStatus.js` (status keys, no `paused`).

---

## 3. Approved business requirements

Owner-approved rules, restated as testable requirements (R#). These are authoritative; anything in this document that conflicts with them is a defect in the document.

| # | Requirement | Design element |
|---|---|---|
| R1 | A normal posting funds **only the first two weeks** of scheduled work. | Period 1 charge at publish (§5, §7). |
| R2 | An admin posting exemption permits **publication without payment only** — not collected, not funded, not work-authorized, not payout-authorized, not a waiver of future funding. | `posted_under_funding_waiver` **[P2]** + `funding_mode` + work-authorization gate (§7, §13). |
| R3 | When an exempt job is claimed: if work starts more than 24 h after the claim, first-two-week collection is **initiated 24 h after the claim**; if ≤ 24 h, **initiated immediately**. Rule controls initiation, not success. Must be durable, recoverable, idempotent; never a browser or in-memory timer. | `scheduled_funding_collections` row inserted in the claim transaction (§7.3, §8). |
| R4 | **No unfunded work.** ACH "processing" is not "collected". Delay must be communicated clearly. | Work authorization requires the current period `funded` (succeeded), never `processing` (§7.4, §9, §11). |
| R5 | Every subsequent two-week period is funded **in advance with lead time**. | Replenishment schedule with card/ACH lead times (§9, §10). |
| R6 | Funding failure → pause the job, stop new work authorization, notify both parties, preserve time records and history, allow safe resumption. | Pause/resume (§11). |
| R7 | Pausing never eliminates compensation for hours already worked. | Date-aware gate; approved pay lines preserved; ledger never reduced by pause (§11.4, §12). |
| R8 | Support card and ACH; off-session recurring charges need proper prior authorization; never assume an initiated ACH is funded. | Mandate/authorization capture before enabling rolling funding (§9, §18). |
| R9 | No automatic clawbacks, transfer reversals or wage deductions as a default. | `PaymentRiskEvent` visibility only; no new reversal paths (§12). |
| R10 | Do not change the technician payout schedule. | `PaymentService`/`JobSettlementService` gates untouched (§12). |

---

## 4. Recommended architecture

```
                 ┌──────────────────────────────────────────────────────────────┐
                 │                      Job (existing)                          │
                 │ status · funding_status(+partially_funded) · settlement_status│
                 │ + funding_mode · paused_at · pause_reason · work_authorized_through_on │
                 └───────────────┬──────────────────────────────┬───────────────┘
                                 │ 1..n                         │ 0..n
                 ┌───────────────▼──────────────┐   ┌───────────▼───────────────────────┐
                 │  job_funding_periods          │   │ job_payment_transactions (existing)│
                 │  sequence, start_on, end_on,  │◄──┤ + job_funding_period_id            │
                 │  working_days, labor_cents,   │   │ + types period_funding_charge /    │
                 │  company_required_cents,      │   │         period_funding_refund      │
                 │  status, funding_due_at,      │   └────────────────────────────────────┘
                 │  initiate_at, funded_at       │
                 └───────────────┬──────────────┘
                                 │ 0..n
                 ┌───────────────▼──────────────────────────────────────────────┐
                 │ scheduled_funding_collections (OUTBOX)                        │
                 │ kind · run_at · status · attempts · lease_until · locked_by   │
                 │ idempotency_key (unique) · last_error · job_payment_txn_id    │
                 └───────────────┬──────────────────────────────────────────────┘
                                 │ scanned every 15 min (FOR UPDATE SKIP LOCKED)
     Railway Cron ──► rake funding:run_due_collections ──► Funding::CollectionRunner
     (or POST /internal/funding/run_due with X-Payments-Cron-Secret)   │
                                                                       ▼
                                           JobFundingService.collect!(period, type: :period_funding_charge)
                                                                       │
                                  Stripe PaymentIntent (off_session, confirm, idempotency key)
                                                                       │
                      webhooks: payment_intent.succeeded / processing / payment_failed / charge.dispute.*
                                                                       │
                           Funding::PeriodStateService (funded / failed / paused / resumed)
```

Principles:

1. **Persist intent, then act.** Every future action is a row before it is a Stripe call. Crashes between the two are reconciled by the next scan using the stored idempotency key and `metadata`.
2. **One writer per concept.** `Funding::PeriodPlanner` creates/regenerates periods; `Funding::CollectionRunner` executes outbox rows; `Funding::PeriodStateService` is the only writer of `job_funding_periods.status`, `jobs.paused_at` and `jobs.work_authorized_through_on`; webhooks call into it rather than updating columns directly.
3. **Reuse, don't fork, the money path.** Period charges go through `JobFundingService.collect!` and `JobStripeOps.create_payment_intent!` so the ACH gate, row locking, idempotency, snapshotting and webhook reconciliation are shared.
4. **Ledger stays whole-job; projection is additive.** `JobLedger::PeriodProjection` (new, read-only) computes per-period collected/consumed/due from the same `job_payment_transactions` and `time_entry_pay_lines` — nothing in `PaymentService` consults it.
5. **Everything behind flags; legacy jobs opt-in only.**

---

## 5. Two-week funding calculation

### 5.1 Period boundaries

- **Anchor** = `job.scheduled_start_at` converted to `job.job_timezone` → `anchor_on` (a date). For `rolling_start` jobs this is only known after `ClaimJobService#ensure_schedule_for_start_mode!`; before claim, periods are **projected** from the earliest possible start and marked `projected`.
- **Period k** covers calendar dates `[anchor_on + 14(k−1), anchor_on + 14k − 1]` (14 calendar days each), clipped to `scheduled_end_at` (or `hard_deadline_at` if earlier).
- **Working dates** inside a period come from `Schedule::WorkingIntervalExpander.working_dates_between(job, from, to)` so `standard_work_days`, `standard_day_shifts` and the weekend policy are respected. Weekend dates are excluded unless `WeekendWorkRequest` accepted rows exist for them (then they are included at the accepted `estimated_hours × applicable_multiplier` as a **period adjustment**, see §10.3).
- A period with zero working dates (e.g. a holiday gap) is still created with `company_required_cents = 0` and auto-marked `funded` so the sequence stays contiguous.

Why 14 calendar days rather than 10 working days: it matches how the owner and companies talk about "two weeks", keeps period boundaries predictable for ACH lead-time math, and degenerates to today's whole-job behaviour for any job of ≤ 14 days (one period). Owner decision D-1 if a 10-working-day definition is preferred.

### 5.2 Amount per period

All arithmetic in integer cents through `JobMoney` (`BigDecimal`, `ROUND_HALF_UP`), snapshotting `company_commission_percent_snapshot` exactly as `JobFundingService.snapshot_company!` does today.

**`actual_hours_worked` jobs**

```
period.scheduled_hours      = Σ over working dates d in period of hours_for(d)
                              hours_for(d) = standard_day_shifts hours for weekday d (fallback job.hours_per_day)
period.labor_cents          = JobMoney.labor_cents(rate: agreed_hourly_rate_cents || hourly_rate_cents,
                                                   hours: period.scheduled_hours)
period.company_required     = period.labor_cents + JobMoney.percent_of(period.labor_cents, company_pct)
period.tech_payout_target   = period.labor_cents − JobMoney.percent_of(period.labor_cents, tech_pct)
```

Invariant: `Σ period.labor_cents == Job#job_amount_cents` for the full schedule; any rounding residue (≤ n−1 cents) is pushed into the **last** period so the whole-job ledger totals match exactly.

**`guaranteed_job_pay` jobs**

The guaranteed `agreed_labor_cents` is prorated by working days: `period.labor_cents = agreed_labor_cents × working_days_in_period / total_working_days` (floor), remainder to the last period. Company % applied per period as above. Rationale: the company's obligation is fixed; rolling funding only changes *when* it is collected.

### 5.3 Premiums (overtime, weekend multipliers)

Base periods fund **scheduled** labor only. Overtime and weekend premiums are unknown in advance, so they are collected as **period true-ups** (§10.3): when period k's approved pay lines exceed `period.labor_cents`, the delta (plus company %) is added to the period k+1 collection; for the last period it flows into the existing `JobSettlementService.settle!` top-up. Owner decision D-4 offers an alternative (pre-fund a premium buffer %).

### 5.4 Examples

| Job | Periods | Period 1 collects | Notes |
|---|---|---|---|
| 5 working days, Mon–Fri, 8 h, $50/h, 10 % company fee | 1 | 5×8×$50 = $2,000 + $200 = **$2,200** | Identical to today's behaviour. |
| 6 weeks Mon–Fri, 8 h, $50/h, 10 % | 3 | 10 days = $4,000 + $400 = **$4,400** | Periods 2–3 same amount, collected with lead time. |
| 3 weeks Mon–Thu (4-day weeks), 10 h, $40/h, 10 % | 2 | 8 days × 10 h × $40 = $3,200 + $320 = **$3,520** | Period 2 has 4 days: $1,760. |
| Guaranteed $9,000 over 30 working days (6 weeks) | 3 | $3,000 + fee | Prorated by working days. |
| Rolling-start job claimed Fri, start Mon | 1..n | Period 1 computed at claim | Projected periods replaced on claim. |

---

## 6. Funding-period data model

Full column list is in §15. Key semantics:

**`job_funding_periods`**

| Column | Meaning |
|---|---|
| `sequence` | 1-based; unique with `job_id`. |
| `period_start_on`, `period_end_on` | Dates in `job_timezone`. |
| `scheduled_working_days`, `scheduled_hours` (decimal) | From the expander at planning time. |
| `labor_cents`, `company_required_cents`, `tech_payout_target_cents` | Snapshotted integers. |
| `trued_up_delta_cents` | Signed premium/overage delta rolled into this period's collection from the previous period. |
| `financial_revision` | `jobs.financial_revision` at planning; re-planning after a counteroffer bumps it and **voids** unfunded periods. |
| `status` | `projected → planned → collection_scheduled → collecting → funded \| funding_failed → (paused) → consumed/closed`, or `voided`. See companion state-machine doc. |
| `collection_initiate_at` | When the outbox row should run (lead time applied). |
| `funding_due_at` | Start of `period_start_on` in `job_timezone`; the point at which work authorization requires `funded`. |
| `funded_at`, `failed_at`, `voided_at`, `void_reason` | Audit timestamps. |

**Relationship to `job_payment_transactions`**: a nullable `job_funding_period_id` FK plus two new `transaction_type` values, `period_funding_charge` (10, in `COLLECTION_TYPES`) and `period_funding_refund` (11, in `REFUND_TYPES` and `SETTLEMENT_REFUND_TYPES`). `initial_job_charge` remains the type for `whole_job_upfront` jobs only; period 1 of a rolling job uses `period_funding_charge` with `sequence = 1` so reports can distinguish the two modes. The ledger does not care which type is used.

**Relationship to time entries**: no FK. `JobLedger::PeriodProjection` maps approved `time_entry_pay_lines` to periods by `time_entries.work_date` (or the entry's start timestamp in job tz) falling in `[period_start_on, period_end_on]`.

---

## 7. Posting, claim and start state machines

Five concepts, each with its own source of truth (detailed transition tables in `docs/ROLLING_FUNDING_STATE_MACHINE.md`):

| Concept | Question | Source of truth | Who may change it |
|---|---|---|---|
| **Posting visibility** | Is this job listed to technicians? | `jobs.status` (`draft`, `pending_funding`, `open`, …) + `go_live_at` | Publish flow, `unpublish`, webhooks (3DS/ACH success) |
| **Claim eligibility** | May a technician claim it? | `Job#available_for_claim?` ∧ `Job#funding_allows_claim?` **[P2]** (extended with `funding_partially_funded?`) | `ClaimJobService` reads only |
| **Funding** | How much verified cash covers which periods? | `job_funding_periods.status` + `JobLedger` | `Funding::PeriodStateService`, webhooks → it |
| **Work authorization** | May hours be logged for date *d*? | `jobs.work_authorized_through_on` (date) ∧ `paused_at IS NULL` ∨ `d < paused_on` | `Funding::PeriodStateService` only |
| **Operational** | Is the assignment active, paused, ended? | `paused_at`, `pause_reason`, `terminated_at`, `finished_at` → `effective_status` | Pause/resume service, termination, finish |

### 7.1 Posting (normal, rolling mode)

```
draft ──publish──► [collect period 1]
   card succeeded ───────────────► open · funding_status=partially_funded (or funded if 1 period) · P1 funded
   card requires_action ────────► pending_funding · funding_status=adjustment_required (existing 3DS path)
   ACH processing ──────────────► pending_funding (existing) ── webhook succeeded ──► open
   failed ──────────────────────► funding_failed (existing)
```

`funding_status` gains one value, `partially_funded (4)`: verified collections cover ≥ period 1 but not the whole job. `funded` keeps P2's strict meaning (ledger fully funded). `Job#funding_allows_claim?` becomes `funding_funded? || funding_partially_funded? || posted_under_funding_waiver? || !priced?`. `funded_terms_locked?` includes `partially_funded`.

### 7.2 Posting (admin exemption)

`posted_under_funding_waiver: true`, `funding_status: unfunded`, `funding_mode: rolling_two_week` (new postings) — visible and claimable, **not** work-authorized (`work_authorized_through_on` nil). Period plan is generated as `planned` with no collections scheduled yet (R2).

### 7.3 Claim

Inside `ClaimJobService#create_claim_atomically!` (same DB transaction as the claim):

1. Resolve schedule (existing). Re-plan periods from the now-known `scheduled_start_at` (replace `projected` rows).
2. If the job is **exempt-posted** and priced:
   - `run_at = claim_at + 24h` if `scheduled_start_at > claim_at + 24h`, else `run_at = now` (R3).
   - Insert `scheduled_funding_collections(kind: deferred_initial, period: 1, run_at:)`.
   - If `run_at = now`, the request also invokes `Funding::CollectionRunner.run_one(row)` **after commit**; if that call never happens (process death), the cron picks the row up within 15 min. The row is the truth; the inline call is an optimisation.
3. If the job is **normally funded** (period 1 already funded at publish): schedule period 2+ collections (`kind: replenishment`) with lead time (§9); set `work_authorized_through_on = period_1.period_end_on`.
4. Technician notification states explicitly whether the job is work-authorized or "awaiting company funding" (R4).

### 7.4 Start of work

Time entries are accepted for date *d* iff: job `reserved`/`filled` (existing) ∧ `d <= work_authorized_through_on` ∧ (`paused_at` nil ∨ `d < paused_on`). `effective_status` returns `"paused"` when `paused_at` present, `"awaiting_funding"` when claimed, start reached and `work_authorized_through_on` nil, else existing values.

---

## 8. Durable scheduler recommendation

### 8.1 Options evaluated

| | **A. Railway Cron + rake scan** | **B. DB outbox + supervised worker** | **C. Durable Active Job adapter (GoodJob / SolidQueue)** |
|---|---|---|---|
| Durability of intent | Only if the rake scans **persisted** rows (otherwise none). | Yes — rows in Postgres. | Yes — jobs in Postgres. |
| New infrastructure | Railway Cron schedule (dashboard), already the documented pattern. | A second always-on Railway service (worker) + supervision. | Gem + its migrations + an always-on worker process (or `async` in-process mode, which is **not** durable across restarts). |
| Precision | 15-min granularity (fine: all deadlines are hours/days). | Seconds. | Seconds. |
| Failure modes | Cron not configured → silent backlog (mitigated by monitoring). | Worker crash loops; needs health checks. | Adapter misconfig; worker scaling; dashboard exposure. |
| Observability | Rows + `rake funding:status` + admin page. | Same rows. | Adapter dashboard. |
| Fit with existing code | Mirrors `payments:release_eligible`, `jobs_lifecycle` rake, `PAYMENTS_CRON_SECRET` HTTP trigger. | New pattern. | New pattern; would also tempt moving webhooks/mailers to async (scope creep). |
| Cost / ops | Lowest. | Medium. | Medium; best long-term if more background work appears. |

### 8.2 Recommendation: **A + B hybrid — outbox rows, cron-triggered scan**

Store every future collection in `scheduled_funding_collections` (B's durability). Execute them from `rake funding:run_due_collections`, triggered every 15 minutes by Railway Cron and optionally by `POST /api/v1/internal/funding/run_due_collections` guarded by `X-Payments-Cron-Secret` (A's trigger, identical to the existing payments cron). Record Option C as the upgrade path: because intent lives in our own table, switching the executor to SolidQueue/GoodJob later is a one-service change.

Justification: it is the only option that requires **no new always-on process**, uses a pattern the repo already documents and tests, and still satisfies R3's "durable, recoverable, idempotent, not browser/in-memory". The 15-minute granularity is irrelevant because the 24-hour and T-minus-days deadlines are coarse.

### 8.3 Runner algorithm (`Funding::CollectionRunner`)

```
acquire pg_advisory_xact_lock(:rolling_funding_runner)   # at most one scan at a time
abort if PlatformSetting rolling_funding_scheduler_enabled == false or ENV ROLLING_FUNDING_DISABLED
loop up to MAX_BATCH (e.g. 50):
  row = ScheduledFundingCollection.where(status: pending).where("run_at <= now()").order(:run_at)
        .lock("FOR UPDATE SKIP LOCKED").first  → mark leased(locked_by, lease_until = now+10min); commit
  begin
    Job.transaction { lock job; re-check period still collectable (not voided/funded/terminated; flags; company method) }
    JobFundingService.collect!(job:, amount_cents: period.company_required_cents + trued_up_delta,
                               transaction_type: :period_funding_charge, revision:, period:, idempotency_key: row.idempotency_key)
    on succeeded   → PeriodStateService.mark_funded!(period, txn)   ; row succeeded
    on processing  → PeriodStateService.mark_collecting!(period)    ; row awaiting_webhook
    on requires_action → notify company (on-session 3DS confirm); row awaiting_action; schedule reminder
    on failed      → row failed; attempts += 1; if attempts < max → clone row with run_at = backoff; else exhausted → PeriodStateService.mark_funding_failed!
  rescue outcome_unknown → row outcome_unknown; next scan retrieves via stored PI id or `Stripe::PaymentIntent.search` on metadata
  rescue StandardError → row error; attempts += 1; backoff; never raise out of the loop
```

Idempotency key: `tf_job_#{job_id}_period_#{sequence}_pfc_r#{financial_revision}_#{amount}_a#{attempt}` where `attempt` only increments after a **definitive** failure (same convention as `TRANSFER_IDEMPOTENCY_SAFE_WINDOW = 23.hours` in `payment_service.rb:420`): a retry after `outcome_unknown` reuses the same key within 23 h; after 23 h the runner must reconcile via Stripe before issuing a new key.

### 8.4 Protections

- Advisory lock prevents overlapping cron runs; `SKIP LOCKED` leasing prevents double-processing inside a run; `lease_until` expiry recovers rows from a dead process.
- Unique `idempotency_key` on the outbox table **and** on `job_payment_transactions` (existing unique index) — the DB refuses a duplicate charge attempt.
- Re-validation under the Job row lock before every Stripe call (job not terminated/finished/voided, period not already funded, flags still on, mode still rolling, company still has a usable method).
- Stripe `metadata` carries `job_id`, `transaction_id`, `job_funding_period_id`, `scheduled_funding_collection_id`; webhooks reconcile by PI id first, metadata second.
- Max attempts (default 3 for cards, 1 for ACH — an ACH retry after NSF is a product decision, D-7) and exponential backoff (1 h, 6 h).
- Batch cap and per-row `rescue` so one bad job cannot starve the queue.
- Clock: compare against DB `now()`; store `run_at` in UTC; compute `funding_due_at` from `job_timezone`.
- `--dry-run` mode prints what would be collected (Phase D).
- Kill switch `ROLLING_FUNDING_DISABLED=1`: scanner exits immediately; **does not** auto-pause jobs (pausing is itself a scheduled action and is also disabled) — admins are alerted that deadlines may be passing.

### 8.5 Failure scenarios

| Scenario | Behaviour |
|---|---|
| Cron never configured | Rows accumulate; `funding:status` and admin monitoring show "oldest due row age"; alert threshold 60 min; manual `rake funding:run_due_collections` works identically. |
| Process dies after Stripe success, before DB write | Row still leased; lease expires; next run re-issues with the **same** idempotency key → Stripe returns the original PI → txn marked succeeded; webhook `payment_intent.succeeded` also lands and `find_locked_collection_txn` by metadata finds the row. |
| Process dies before Stripe call | Row lease expires; re-run is a no-op retry. |
| Duplicate cron fire | Advisory lock → second run exits. |
| Company removed payment method | Pre-check fails → row `failed` with reason `no_payment_method`; company + admin notified; pause at `funding_due_at` if still unfunded. |
| ACH `processing` at `funding_due_at` | Period not funded → work not authorized → pause with reason `ach_processing` and user-safe copy "bank transfer still clearing" (R4). Webhook success auto-resumes. |
| Stripe 5xx / network | `outcome_unknown` → reconcile; no new key for 23 h. |
| Job terminated between schedule and run | Re-validation voids the row. |
| Counteroffer changes rate after periods planned | `apply_accepted_terms!` bumps `financial_revision`; planner voids unfunded periods and re-plans; pending outbox rows for voided periods are cancelled. |

### 8.6 Cadence

Every 15 minutes (`*/15 * * * *`). Also run `funding:schedule_pauses` inside the same task: any period whose `funding_due_at <= now()` and `status != funded` while `rolling_funding_auto_pause_enabled` → pause (§11).

---

## 9. Card vs ACH lead times

Stripe facts used (docs retrieved 2026-11-11: [ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Save and reuse cards](https://docs.stripe.com/payments/save-and-reuse-cards-only)): ACH success/failure notification can take up to **4 business days**; settlement T+4 standard (T+2 if enabled); ACH refunds take up to 3 business days; disputes final (60 calendar days personal / 2 business days business accounts); idempotency keys retained ≥ 24 h; off-session card charges fail with `authentication_required` when 3DS is needed.

| | Card | ACH |
|---|---|---|
| Outcome latency | Seconds (or `requires_action`). | Up to 4 business days to `succeeded`/`payment_failed`. |
| Replenishment initiate (`collection_initiate_at`) | `funding_due_at − 3 calendar days` (default; D-5). Leaves ≥ 48 h for decline → fix → retry. | `funding_due_at − 7 calendar days` (≥ 4 business days + weekend/holiday buffer; D-5). |
| Retry window | Up to 3 attempts, 1 h / 6 h backoff, last attempt ≥ 12 h before due. | Default **no automatic retry** (NSF retry rules and Nacha R01 reinitiation limits → D-7). Company is asked to pay by card or re-authorize. |
| `requires_action` | Notify company; existing on-session `confirm_funding`-style confirm; reminder at T−24 h. | n/a |
| At `funding_due_at` not funded | Pause (`reason: card_failed` / `awaiting_payment_action`). | Pause (`reason: ach_processing` if still processing — copy says delay, not failure; `ach_failed` if failed). |
| Deferred first collection (exempt claim) | Per R3 timing; if start is < 7 days away and the method is ACH, the technician is told work may not be authorized by the start date. | Same; communicates clearly (R4). |
| Authorization | SetupIntent `usage: off_session` (already how methods are saved, `company_payment_methods_service.rb`). Treated as merchant-initiated recurring/unscheduled transactions. | Mandate collected at bank setup via Stripe.js (`ACH_PAYMENTS.md`). Mandate copy must be amended to cover recurring period debits **before** ACH rolling funding is enabled (§18). |
| Processing ≠ funded | n/a | Enforced: `JobLedger` counts only `succeeded`; `PeriodStateService.mark_funded!` is only called from succeeded paths. |

Companies choose a default method; the planner stores `planned_payment_method_type` on each period at scheduling time so lead time is deterministic; if the company changes the default later, the runner re-reads the current default and, when switching card → ACH too late to clear, warns both parties.

---

## 10. Automatic replenishment

### 10.1 When collections are scheduled

- At **publish** (normal mode): period 1 collected synchronously; periods 2..n outbox rows created with `kind: replenishment` and `run_at = period.collection_initiate_at`. If a later period's `collection_initiate_at` is already in the past (short gaps), it runs on the next scan.
- At **claim** (exempt mode): see §7.3.
- At **extend** (`jobs_controller.rb:508`): planner appends periods for the new tail and schedules collections; if the extension lands inside the current period's window, that period's `company_required_cents` is increased and a `kind: adjustment` row is scheduled immediately.
- At **counteroffer acceptance**: re-plan from the new revision (see §8.5).
- At **termination** or **finish**: all pending rows cancelled; unfunded periods voided; refunds of already-collected unused periods flow through existing `refund_unfilled_job!`/`settle!` paths (`period_funding_refund`).

### 10.2 What is collected

`amount = period.company_required_cents + period.trued_up_delta_cents` (never below zero; negative deltas — e.g. unpaid sick days — are **not** refunded mid-job; they roll forward and net at settlement, D-6).

### 10.3 Period true-up

When period k closes (`period_end_on` passed and all its time entries approved or 72 h elapsed), `PeriodProjection` computes `consumed_cents(k)` = Σ approved pay lines dated in k (labor) + company %. `delta = consumed − period.company_required_cents`. Positive deltas (overtime, accepted weekend work) are added to period k+1's pending collection if it has not run yet, else a `kind: true_up` row is scheduled for immediate run. For the final period the delta is left to `JobSettlementService.settle!`, unchanged.

### 10.4 Notifications

Company: T−lead "we will debit $X on <date> for <period dates>"; success; failure with CTA; pause warning 24 h before due if still unfunded. Technician: funding confirmed for next period; "funding delayed — do not start work on <date> unless you hear from us"; pause; resume. All via existing notification/mailer paths (sandboxed in staging).

---

## 11. Pause / resume

### 11.1 Triggers (`pause_reason`)

| Reason | Trigger |
|---|---|
| `funding_not_received` | `funding_due_at` reached, period not `funded`, last collection `failed`/`exhausted`/`no_payment_method`. |
| `ach_processing` | Due reached, collection `processing`. Copy says "clearing", not "failed". |
| `payment_action_required` | Due reached, PI `requires_action`. |
| `dispute_or_return` | `PaymentRiskEvent.blocking` opened on a **period** charge (post-success return/dispute). |
| `admin` | Manual admin pause (existing admin tooling pattern). |

### 11.2 Effects (all in one transaction, Job row locked)

- `jobs.paused_at = now`, `pause_reason`, `paused_on` (date in job tz).
- `work_authorized_through_on` unchanged (it already excludes the unfunded period); the gate denies dates ≥ `paused_on`.
- `status` **unchanged** (`filled`) so lifecycle scopes, counteroffers, messaging, time-entry approval all keep working; `effective_status` → `"paused"`.
- Time entries dated **before** `paused_on` may still be submitted, approved, rejected (R7). Approved pay lines are never touched.
- `scheduled_end_at`, `hard_deadline_at`, weekend requests, applications, ratings — untouched. Pause does **not** terminate; termination remains the company's explicit action through `TerminateAssignmentService` (which already settles and pays worked hours).
- Notifications to both parties (R6).
- `JobFundingPeriod#status` → `paused_unfunded` for the blocking period; `jobs.funding_status` → `funding_failed` only for definitive failures (so UI copy matches), stays as-is for `ach_processing`.

### 11.3 Resume

- **Automatic**: the blocking period becomes `funded` (webhook success or successful retry) → `PeriodStateService.resume!`: clear `paused_at`, extend `work_authorized_through_on` to `period.period_end_on`, notify. Pause/resume cycles are appended to a `job_term_change_audits`-style audit (reuse the existing audit table with a new `change_type`, or a small `job_pause_events` table — D-8).
- **Schedule drift**: if the pause consumed working days, by default remaining periods **keep their dates** (the company lost those days; period k's `consumed` will be lower and the surplus nets forward). Alternative (D-9): shift the remaining schedule and ask the technician to accept via the existing schedule-proposal flow.
- **Manual**: admin may resume only when the current period is `funded`; UI must refuse otherwise (no "resume into unfunded work").

### 11.4 Compensation guarantee (R7)

Hours worked before the pause were authorized only because their period was `funded`, so verified cash exists for them. Settlement at finish/termination pays them under the unchanged `release_to_technician` gates. The one residual exposure is a **post-success ACH return/dispute** on an already-consumed period — covered today by `PaymentRiskEvent` (transfer blocked, admin investigation, no clawback). That exposure is platform risk, not technician risk, and is flagged in §18.

---

## 12. Ledger and payout safety

### 12.1 Invariants (unchanged and verified by tests in the companion matrix)

1. `collected_cents` counts only `succeeded` `COLLECTION_TYPES`; `processing` ACH never counts.
2. A transfer is created only when `ledger.fully_funded` (whole job) — `payment_service.rb:94`.
3. `payout_amount <= ledger.net_funded_cents` — `payment_service.rb:155`.
4. No transfer while any collection is `processing`, any refund pending, any blocking `PaymentRiskEvent`, or an existing transfer.
5. Transfers carry `transfer_group = TECHFLASH_JOB_#{id}`; `source_transaction` only when exactly one succeeded charge, else `platform_balance` — multi-period jobs automatically take the platform-balance path.

### 12.2 Allocation

Period funds are **not** Stripe-level holds; they are platform-balance cash recorded against a period. Allocation is a ledger projection: `PeriodProjection(k) = {collected, refunded, consumed(approved pay lines in k), surplus}`. The projection is advisory (UI, true-ups, admin); the payout gate uses the whole-job sum, so a surplus in period 1 legitimately covers overtime in period 2 — exactly as money fungibility implies, and exactly as today's single-pot ledger works.

### 12.3 Every `fully_funded` caller, re-examined for P3

| Caller | Risk introduced by P3 | Mitigation |
|---|---|---|
| `payment_service.rb:94` | A rolling job finished early with periods 1..k funded and k+1..n voided: `company_required_cents` is derived from `current_labor_cents` = approved pay lines (actual hours) or agreed labor truncated by termination — so required ≤ collected and `fully_funded` holds. If voided periods were never collected and the job is **finished without termination** on a guaranteed-pay basis, required stays whole-job → `settle!` collects the shortfall as `final_hours_top_up` or blocks. Correct and conservative. | None needed; add test. |
| `job_settlement_service.rb:45,130` | Same as above. | Unchanged. |
| `terminate_assignment_service.rb:236` | Termination truncates schedule → required falls; collected unused period funds become `amount_refundable_cents` → refunded via existing path with `period_funding_refund`. | Add `period_funding_refund` to `SETTLEMENT_REFUND_TYPES`. |
| `payments.rake:36,38` | Reporting only. | Extend output. |
| `job_serializer.rb:149` | `fully_funded: false` for in-progress rolling jobs would show "Partially funded." in `JobDetail.jsx:1191`. | Frontend copy keyed on new `current_period` hash (§14). |

### 12.4 Things P3 explicitly does **not** do

- No new transfer paths, no mid-job technician payouts (D-10 default: unchanged schedule, R10).
- No automatic refunds of period surplus mid-job.
- No transfer reversals, no deductions from technician payouts for company payment failures (R9).
- No change to `TRANSFER_IDEMPOTENCY_SAFE_WINDOW`, `TransferRetryAuthorization`, or admin reconcile endpoints.

---

## 13. HSI / waiver compatibility and legacy migration

### 13.1 Facts (from repo + P2 report; no production data touched)

- Company #8 (HSI) has `job_funding_waived: true`; jobs #32–38 are `funding_status: funded` with **zero** `job_payment_transactions`; jobs #28–31 have real succeeded collections. P2's dry-run rake proposes 32–38 → `unfunded` + `posted_under_funding_waiver: true`.
- Company #19 completed the live ACH pilot; global ACH is OFF.

### 13.2 `funding_mode` for existing rows (backfill in the data-model migration, no money movement)

| Existing job | `funding_mode` | Periods | Outbox rows |
|---|---|---|---|
| Any job with ≥ 1 succeeded collection (incl. HSI 28–31, company 19 pilot) | `whole_job_upfront` | none | none |
| HSI 32–38 (waived, no collections) | `legacy_exempt` | none | **none — never auto-debited** |
| Unpriced jobs | `whole_job_upfront` | none | none |
| Drafts | NULL until publish → chosen by flags at publish time | — | — |

Rule: the planner and runner **refuse** to create periods or collections for `whole_job_upfront` and `legacy_exempt` jobs. `rolling_two_week` is assigned only at publish (new jobs under the flag) or by the explicit opt-in below.

### 13.3 Explicit opt-in for a legacy exempt job

Admin-initiated, company-authorized, two-step:

1. Admin `POST /api/v1/admin/jobs/:id/funding/propose_rolling_conversion` → creates a proposal record (reuse `job_term_change_audits` with `change_type: funding_mode_conversion`) and notifies the company.
2. Company (on-session, authenticated) `POST /api/v1/jobs/:id/funding/accept_rolling_conversion` with explicit consent text acceptance → `funding_mode: rolling_two_week`, periods planned from today (or next working day), first collection scheduled **immediately on-session** (card: confirm with 3DS if needed; ACH: requires fresh mandate acknowledgement of recurring debits), `posted_under_funding_waiver` stays `true` for history.

Without step 2 nothing is charged. HSI remains exempt indefinitely unless the owner decides otherwise (D-11).

### 13.4 Waiver semantics after P3

`company_profiles.job_funding_waived` continues to mean "may publish without paying". It never grants work authorization under P3 (`work_authorized_through_on` stays nil until period 1 is funded). If the owner wants HSI to keep working without funding during the transition, that is an explicit admin **work-authorization override** flag (`jobs.admin_work_authorization_override_until`) with audit — D-11 default: not granted; legacy_exempt jobs keep today's behaviour (no gate) until converted, because the work-authorization gate is applied only to `rolling_two_week` jobs in Phase E.

---

## 14. API, frontend and admin changes (not implemented)

### 14.1 Serializer additions (`JobSerializer#payment_summary`)

```json
"funding_mode": "rolling_two_week",
"work_authorized_through_on": "2026-12-05",
"paused_at": null, "pause_reason": null,
"current_period": { "sequence": 2, "period_start_on": "...", "period_end_on": "...", "status": "funded",
                    "company_required_cents": 440000, "collected_cents": 440000, "consumed_cents": 198000 },
"next_collection": { "run_at": "...", "amount_cents": 440000, "payment_method_type": "card", "status": "pending" },
"funding_periods": [ ...one row per period (company/admin only)... ]
```

Technicians receive `work_authorized_through_on`, `current_period.status`, `paused_at/pause_reason` and user-safe copy, never amounts the company pays.

### 14.2 New endpoints

| Route | Actor | Purpose |
|---|---|---|
| `GET /api/v1/jobs/:id/funding_periods` | company/admin/tech (reduced) | Period plan and statuses. |
| `POST /api/v1/jobs/:id/funding_periods/:sequence/pay_now` | company | On-session pay for a failed/`requires_action` period (returns `client_secret` for 3DS like `confirm_funding`). |
| `POST /api/v1/jobs/:id/funding/accept_rolling_conversion` | company | §13.3 step 2. |
| `POST /api/v1/admin/jobs/:id/funding/propose_rolling_conversion` | admin | §13.3 step 1. |
| `POST /api/v1/admin/jobs/:id/funding/pause` / `resume` | admin | Manual pause; resume only if current period funded. |
| `GET /api/v1/admin/funding/scheduler` | admin | Outbox health: pending/leased/failed/outcome_unknown counts, oldest due age, last run. |
| `POST /api/v1/admin/funding/collections/:id/retry` | admin | Re-queue an exhausted row (audited). |
| `POST /api/v1/internal/funding/run_due_collections` | cron (`X-Payments-Cron-Secret`) | Trigger. |
| `PUT /api/v1/admin/rolling_funding_settings/global` / `companies/:id` | admin | Flags (mirrors `admin/ach_settings`). |

### 14.3 Frontend (described only)

- `CreateJob.jsx` / `EditJob.jsx`: show "You'll be charged **$X now** for the first two weeks (dates). Later periods are charged automatically N days before they start." Consent checkbox text for recurring charges (card) / mandate acknowledgement (ACH). `termsLocked` includes `partially_funded`.
- `JobDetail.jsx:1183–1214`: replace `funding_status`-keyed copy with `current_period`/`next_collection` copy; show "Paused — funding not received" banner with CTA for company; technician sees "Do not begin work on <date> until funding is confirmed".
- `JobTimeEntriesPanel.jsx`: disable entry for dates beyond `work_authorized_through_on` or ≥ `paused_on`, with reason text.
- `SettingsPage.jsx` / `CompanyPaymentMethodsPanel.jsx`: updated authorization/mandate copy; billing history rows already include `transaction_type` so `period_funding_charge` appears with period dates.
- `AdminJobPaymentsPage.jsx`: new filters (`paused`, `funding_due_soon`, `scheduler_backlog`); period table on the job drawer; scheduler health card in System Controls alongside `SystemControlsAchFlags.jsx`.
- `jobStatus.js`: add `paused` and `awaiting_funding` effective-status keys.

---

## 15. Minimum data model

Smallest set that satisfies R1–R10 (DDL shown for clarity; **no migration is created by this PR**).

```sql
-- jobs (additive)
ALTER TABLE jobs ADD COLUMN funding_mode integer;                    -- 0 whole_job_upfront, 1 rolling_two_week, 2 legacy_exempt (NULL for drafts)
ALTER TABLE jobs ADD COLUMN work_authorized_through_on date;
ALTER TABLE jobs ADD COLUMN paused_at timestamp, ADD COLUMN paused_on date, ADD COLUMN pause_reason varchar;
-- funding_status enum gains partially_funded = 4 (no DDL; integer column)

CREATE TABLE job_funding_periods (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs,
  sequence integer NOT NULL,
  period_start_on date NOT NULL, period_end_on date NOT NULL,
  scheduled_working_days integer NOT NULL, scheduled_hours numeric(8,2) NOT NULL,
  labor_cents integer NOT NULL, company_required_cents integer NOT NULL, tech_payout_target_cents integer NOT NULL,
  trued_up_delta_cents integer NOT NULL DEFAULT 0,
  financial_revision integer NOT NULL,
  status varchar NOT NULL DEFAULT 'planned',
  planned_payment_method_type varchar,
  collection_initiate_at timestamp, funding_due_at timestamp NOT NULL,
  funded_at timestamp, failed_at timestamp, voided_at timestamp, void_reason varchar,
  created_at timestamp NOT NULL, updated_at timestamp NOT NULL,
  UNIQUE (job_id, sequence)
);
CREATE INDEX ON job_funding_periods (status, funding_due_at);

CREATE TABLE scheduled_funding_collections (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs,
  job_funding_period_id bigint NOT NULL REFERENCES job_funding_periods,
  job_payment_transaction_id bigint REFERENCES job_payment_transactions,
  kind varchar NOT NULL,                 -- deferred_initial | replenishment | true_up | adjustment | retry | manual
  run_at timestamp NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',  -- pending | leased | awaiting_webhook | awaiting_action | succeeded | failed | outcome_unknown | exhausted | canceled
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
  lease_until timestamp, locked_by varchar,
  idempotency_key varchar NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  last_error_code varchar, last_error_message text, last_attempted_at timestamp,
  created_at timestamp NOT NULL, updated_at timestamp NOT NULL
);
CREATE INDEX ON scheduled_funding_collections (status, run_at);

-- job_payment_transactions (additive)
ALTER TABLE job_payment_transactions ADD COLUMN job_funding_period_id bigint REFERENCES job_funding_periods;
-- transaction_type enum gains period_funding_charge = 10, period_funding_refund = 11

-- company_profiles (additive)
ALTER TABLE company_profiles ADD COLUMN rolling_funding_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE company_profiles ADD COLUMN recurring_charge_authorized_at timestamp, ADD COLUMN recurring_charge_authorization_version varchar;

-- platform_settings rows (no DDL): rolling_funding_enabled, rolling_funding_scheduler_enabled,
--   rolling_funding_auto_pause_enabled, rolling_funding_ach_enabled, rolling_funding_card_lead_days (3),
--   rolling_funding_ach_lead_days (7)
```

Deliberately **not** added: a separate `job_pause_events` table (reuse `job_term_change_audits` with new `change_type`s unless D-8 says otherwise), per-technician periods, Stripe-level holds, interim payouts.

---

## 16. Test matrix (summary)

Full matrix in `docs/ROLLING_FUNDING_TEST_MATRIX.md`. Headline groups:

1. Period planning math (short/long jobs, 4-day weeks, holidays, guaranteed pay proration, rounding residue, re-plan on counteroffer, extension, termination truncation, timezone edges).
2. Publish paths × funding_mode × payment type × outcome (card ok / 3DS / decline; ACH processing → success / failure; waived; unpriced).
3. Claim paths: exempt with start > 24 h / ≤ 24 h / exactly 24 h; rolling-start resolution; concurrent claims; claim when flags off.
4. Scheduler: due scan, SKIP LOCKED concurrency, lease expiry, advisory lock, idempotency reuse within 23 h, outcome_unknown reconciliation, kill switch, dry-run, batch cap, flags per company.
5. Webhooks: success for period > 1 does not publish; failure after success raises investigation; dispute on period charge blocks transfer and pauses.
6. Work authorization gate: dates before/after `work_authorized_through_on`; pre-pause dates allowed; approvals still work while paused; `effective_status` values.
7. Pause/resume: each reason; auto-resume on success; manual resume refused when unfunded; audits; notifications.
8. Ledger/payout: `fully_funded` callers unchanged; multi-period → platform_balance; refunds of unused periods; no transfer during processing; cap at net funded.
9. Legacy/HSI: backfill modes; planner refuses non-rolling; conversion two-step; no debit without step 2.
10. Admin/API serializers and authorization (tech sees no company amounts).
11. SQLite CI compatibility (`FOR UPDATE SKIP LOCKED` and advisory locks must be guarded by adapter checks — tests run on SQLite per `.github/workflows`).

---

## 17. Rollout phases and feature flags

### 17.1 Flags (all new; none reuse `ACH_GLOBAL_DISABLED` / `ach_payments_globally_enabled`)

| Flag | Scope | Default | Effect |
|---|---|---|---|
| `ROLLING_FUNDING_DISABLED` (ENV) | global kill switch | unset | Scanner, planner and auto-pause exit immediately; UI shows legacy copy. Fail-closed for **new** rolling behaviour; never changes existing data. |
| `PlatformSetting rolling_funding_enabled` | global | false | New publishes may use `rolling_two_week` (also requires company flag). |
| `PlatformSetting rolling_funding_scheduler_enabled` | global | false | Runner executes outbox rows (otherwise logs only). |
| `PlatformSetting rolling_funding_auto_pause_enabled` | global | false | Due-date pauses are applied (otherwise only admin alerts). |
| `PlatformSetting rolling_funding_ach_enabled` | global | false | Period charges may use ACH (AND-ed with existing `AchAccess`). |
| `company_profiles.rolling_funding_enabled` | company | false | Pilot opt-in per company. |
| `PlatformSetting rolling_funding_card_lead_days` / `_ach_lead_days` | global | 3 / 7 | Tunable lead times. |

### 17.2 Phases

| Phase | Content | Flags | Exit criteria |
|---|---|---|---|
| **A — Docs** | This proposal; owner decisions resolved. | — | Decisions D-1…D-12 recorded. |
| **B — Schema + models** | Tables/columns, enums, backfill `funding_mode`, `PeriodProjection`, planner (pure functions), serializers read-only. No behaviour change. | all off | Backfill verified: zero periods/outbox rows; every existing job has a mode; tests green on SQLite + Postgres. |
| **C — Runner in dry-run** | Rake + runner + admin scheduler page; cron configured in Railway (dashboard change by owner, not by this work); runs log "would collect" only. Staging E2E extended with period charges in Stripe test mode. | `scheduler_enabled=false` | 7 days of clean dry-run logs in staging/prod. |
| **D — Pilot publish** | `rolling_funding_enabled` + one pilot company (card only). Period 1 at publish, replenishments scheduled and executed. No auto-pause (alerts only). | global on, scheduler on, pause off, ach off, 1 company | ≥ 2 multi-period jobs replenished successfully; reconciliation clean. |
| **E — Work authorization + auto-pause** | Gate in time entries/effective status for `rolling_two_week` jobs; pause/resume live; exempt-claim deferred collection live. | `auto_pause_enabled` for pilot | One simulated failure → pause → pay_now → resume verified in staging; none unexpected in prod. |
| **F — ACH periods** | `rolling_funding_ach_enabled` after mandate copy update and counsel sign-off; 7-day lead; processing → pause copy. | ach on for pilot | One ACH period cycle end-to-end (≥ 4 business days). |
| **G — General availability + legacy conversion** | Company flag defaults on for new companies; HSI conversion proposals only if owner decides (D-11). | all on | Legacy jobs still untouched unless converted. |

Rollback at any phase = flip the relevant flag; outbox rows stay pending; no data deletion.

---

## 18. Legal and financial risks (flag for counsel — not legal advice)

| Area | Risk | Design mitigation | Counsel question |
|---|---|---|---|
| **ACH mandate scope** | Current Settings copy (`ACH_PAYMENTS.md` decision 4) covers posting, counteroffer deltas and settlement top-ups, not recurring period debits. Nacha requires authorization matching the debit pattern (recurring/variable). | Phase F blocked until copy is revised; `recurring_charge_authorized_at/_version` records acceptance; show amount and date in advance notice. | Does the existing Stripe-hosted mandate text cover variable recurring debits? Is pre-notification of amount changes required for business (CCD) debits? |
| **Card network rules (MIT)** | Off-session recurring/unscheduled merchant-initiated charges need cardholder agreement and correct Stripe `off_session` flags. | Already `off_session: true`; add explicit consent at publish/conversion. | Required disclosure wording. |
| **Nacha reinitiation limits / NSF retries** | R01/R09 returns may be reinitiated at most twice within 180 days. | Default no automatic ACH retry (D-7). | Confirm policy. |
| **ACH return / dispute after work performed** | Returns up to 4 business days; disputes up to 60 days (personal) — funds can leave after period consumed. | `PaymentRiskEvent` blocking, no clawback from technician (R9); platform absorbs/collects from company. | Collection remedies against companies; terms language. |
| **Holding company funds for future work** | Platform balance holds pre-paid period funds; potential escrow / money-transmission considerations (Stripe Connect payfac structure mitigates). | Only one period ahead is held; refunds of unused periods on termination. | Confirm Connect structure covers advance funding. |
| **Texas Payday Law / wage timing** | If technicians are employees (W-2) non-exempt employees must be paid at least semi-monthly; pause must not delay payment for hours worked. If 1099, contract terms govern. | Payout schedule unchanged (R10); pause never reduces earned amounts (R7). | Classification and whether finish-based payout timing complies for long multi-period jobs (D-10). |
| **Wage deductions** | No deductions from technician pay for company payment failures. | R9 enforced by having no deduction path. | — |
| **Refund timing** | ACH refunds take up to 3 business days; cannot be cancelled. | Existing refund status handling (`pending` not auto-failed). | Disclosure in terms. |
| **Pausing and technician reliance** | Technician reserved time; pause for company non-payment may create claims. | Clear notices; owner may define a cancellation/kill fee (D-12). | Contract remedies. |
| **Data** | Only masked payment-method data stored (existing rule). | Unchanged. | — |

---

## 19. PR sequence

| # | Branch (suggested) | Content | Depends on | Size |
|---|---|---|---|---|
| PR-0 | `cursor/rolling-two-week-funding-architecture-6cf6` | **This docs-only proposal** (draft). | — | docs |
| PR-1 | `p3/funding-data-model` | Migrations (`job_funding_periods`, `scheduled_funding_collections`, job/company/txn columns), enum additions, `funding_mode` backfill (data migration, no money), models + validations, `PeriodProjection` (read-only). | P2 merged (needs `posted_under_funding_waiver`). | M |
| PR-2 | `p3/period-planner` | `Funding::PeriodPlanner` (pure), `JobMoney` helpers, serializer `funding_periods` read-only, behind `rolling_funding_enabled`. | PR-1 | M |
| PR-3 | `p3/collection-runner-dry-run` | Outbox runner, rake tasks (`funding:run_due_collections`, `funding:status`), internal HTTP trigger, admin scheduler endpoint, `CRON_JOBS.md` update; dry-run only. | PR-1 | M |
| PR-4 | `p3/publish-and-claim-integration` | Period-1 charge at publish, replenishment scheduling, exempt-claim deferred collection (24 h rule), webhook period handling, `partially_funded`. | PR-2, PR-3 | L |
| PR-5 | `p3/work-authorization-pause-resume` | Gate in time entries / effective status, `PeriodStateService`, pause/resume, notifications, admin pause/resume, pay_now endpoint. | PR-4 | L |
| PR-6 | `p3/frontend` | CreateJob/EditJob consent + copy, JobDetail period UI, time-entry gating, admin pages, settings copy. | PR-4 (API) | L |
| PR-7 | `p3/ach-period-charges` | ACH lead-time path, mandate copy, `rolling_funding_ach_enabled`. | PR-5, counsel | S |
| PR-8 | `p3/legacy-conversion` | Two-step conversion endpoints/UI; HSI tooling; docs. | PR-5 | M |
| PR-9 | `p3/hardening` | Staging E2E runner extension, payments:diagnose period rows, flag defaults, runbook. | all | S |

Each PR ships its slice of the test matrix. No PR in the sequence touches `PaymentService.release_to_technician` gates except to add tests.

---

## 20. Owner decisions

**A — Approved business rules (no decision needed):** R1–R10 in §3.

**B — Technical decisions proposed here (owner may veto):**

- Outbox + cron-triggered rake (Option A+B hybrid) over a worker/adapter.
- 14-calendar-day periods anchored at effective start; premiums trued-up, not pre-funded.
- `funding_status` gains `partially_funded`; `JobLedger` whole-job semantics preserved.
- Pause keeps `status: filled`; new `paused_at`/`pause_reason` columns; `effective_status: "paused"`.
- Legacy jobs backfilled to `whole_job_upfront`/`legacy_exempt`; conversion is explicit two-step.

**C — Unresolved, with options and defaults:**

| ID | Question | Options | Default if silent |
|---|---|---|---|
| D-1 | Period definition | (a) 14 calendar days; (b) 10 working days | **(a)** |
| D-2 | Anchor for rolling-start jobs before claim | (a) project from earliest start, re-plan on claim; (b) no periods until claim | **(a)** |
| D-3 | Short jobs (≤ 14 days) | (a) single period = today's behaviour; (b) still "rolling" labelled | **(a)** |
| D-4 | Overtime/weekend premiums | (a) true-up into next period; (b) pre-fund buffer % | **(a)** |
| D-5 | Lead times | card 3 d / ACH 7 d; or card 2 d / ACH 5 business days | **3 / 7 calendar days** |
| D-6 | Negative true-up (under-consumption) | (a) roll forward, net at settlement; (b) refund each period | **(a)** |
| D-7 | ACH automatic retry after failure | (a) none, ask company; (b) one retry after 2 business days | **(a)** |
| D-8 | Pause audit storage | (a) reuse `job_term_change_audits`; (b) new `job_pause_events` | **(a)** |
| D-9 | Schedule after pause | (a) keep dates, lost days are lost; (b) shift and re-propose schedule | **(a)** |
| D-10 | Interim technician payouts per funded period | (a) no — unchanged finish-based payout (R10); (b) per-period release later | **(a)** |
| D-11 | HSI jobs 32–38 | (a) remain `legacy_exempt`, no gate, no debit; (b) propose conversion; (c) admin work-authorization override with audit | **(a)** |
| D-12 | Company non-payment → technician kill fee / notice period | (a) none in P3; (b) define | **(a)** — counsel |

---

### Appendix — What this PR does not change

No files outside `docs/` are modified. No migrations, schema, code, scheduler, worker, payment service, frontend, Stripe object, Railway/Vercel configuration, ACH flag, production row, or the P2 branch/PR were created or changed.
