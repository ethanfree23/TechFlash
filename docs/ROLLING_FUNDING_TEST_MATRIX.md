# Rolling Two-Week Funding — Test Matrix

Companion to `docs/ROLLING_TWO_WEEK_FUNDING_ARCHITECTURE.md`. Lists the tests each implementation PR must ship. Framework: Minitest, following `skilled_hub_api/test/services/*` and `test/controllers/api/v1/*`. CI runs on SQLite (`.github/workflows`), so Postgres-only constructs (`FOR UPDATE SKIP LOCKED`, advisory locks) must be adapter-guarded and additionally covered by a Postgres job or a staging check.

Legend: **U** unit, **S** service, **C** controller/API, **W** webhook, **E** staging E2E (Stripe test mode).

## 1. Period planning (`Funding::PeriodPlanner`, `JobMoney`) — PR-2

| ID | Case | Expect |
|---|---|---|
| PP-1 U | 5 working days Mon–Fri | 1 period; amount == `company_charge_cents` (today's behaviour) |
| PP-2 U | 6 weeks Mon–Fri 8 h | 3 periods × 10 working days; Σ labor == `job_amount_cents` |
| PP-3 U | 3 weeks Mon–Thu | periods 8 + 4 working days |
| PP-4 U | Period with zero working days (shift gap) | period created, `company_required_cents` 0, auto-`funded` |
| PP-5 U | Rounding residue | residue ≤ n−1 cents lands in last period; totals equal |
| PP-6 U | `guaranteed_job_pay` proration | per-period floor, remainder last; Σ == `agreed_labor_cents` |
| PP-7 U | `standard_day_shifts` with differing hours per weekday | hours summed per date, not `hours_per_day × days` |
| PP-8 U | Accepted `WeekendWorkRequest` inside a period | included at `estimated_hours × multiplier` as adjustment |
| PP-9 U | `job_timezone` across DST boundary | `funding_due_at` = local midnight of `period_start_on` |
| PP-10 U | `hard_deadline_at` earlier than `scheduled_end_at` | periods clipped to deadline |
| PP-11 S | Re-plan after counteroffer (`financial_revision` bump) | unfunded periods voided; funded kept; new periods at new rate; pending outbox rows canceled |
| PP-12 S | `extend` beyond last period | new periods appended; collections scheduled; current period amount adjusted if extension inside window |
| PP-13 S | Termination mid-period 2 | periods ≥ 3 voided; period 2 kept; refund path uses `period_funding_refund` |
| PP-14 S | Planner called on `whole_job_upfront` / `legacy_exempt` job | raises/returns no-op; no rows created |
| PP-15 S | Rolling-start job before claim | `projected` periods; replaced with `planned` on claim |

## 2. Publish — PR-4

| ID | Case | Expect |
|---|---|---|
| PB-1 C | Rolling flag on, company flag on, card succeeds, n>1 | txn `period_funding_charge` seq 1; job `open`, `partially_funded`; P2..n `collection_scheduled` with `run_at = due − 3 d`; `work_authorized_through_on = P1.end` |
| PB-2 C | Same, n == 1 | `funded`; no outbox rows |
| PB-3 C | Card `requires_action` | `pending_funding` / `adjustment_required`; `client_secret` returned (existing path); after `confirm_funding` → PB-1 outcome |
| PB-4 C | Card declined | `funding_failed`; no periods funded; no outbox rows run |
| PB-5 C | ACH default, processing | `pending_funding`; P1 `collecting`; webhook success → PB-1 outcome; no `publish!` twice |
| PB-6 C | ACH failure webhook | P1 `funding_failed`; job unpublished state unchanged |
| PB-7 C | Waived company (P2 behaviour) | `open`, `unfunded`, `posted_under_funding_waiver`; periods `planned`; **no** outbox rows; `work_authorized_through_on` nil |
| PB-8 C | Unpriced job | `funded` (vacuous), mode `whole_job_upfront`, no periods |
| PB-9 C | Global flag on, company flag off | legacy whole-job charge; mode `whole_job_upfront` |
| PB-10 C | `ROLLING_FUNDING_DISABLED=1` | identical to PB-9 |
| PB-11 C | Company has no payment method | `enforce_card_for_publish!` blocks (existing) |
| PB-12 C | Idempotent double publish request | one txn (unique idempotency key) |

## 3. Claim — PR-4

| ID | Case | Expect |
|---|---|---|
| CL-1 S | Exempt job, start = claim + 48 h | outbox `deferred_initial` `run_at = claim + 24 h`; no Stripe call during claim |
| CL-2 S | Exempt job, start = claim + 12 h | outbox row `run_at = now`; inline attempt after commit; row durable if inline attempt raises |
| CL-3 S | Exempt job, start = claim + 24 h exactly | treated as ≤ 24 h → immediate |
| CL-4 S | Exempt job, no payment method on file | row created; runner marks `failed(no_payment_method)`; both parties notified; no authorization |
| CL-5 S | Normally funded rolling job | no deferred row; P2..n already scheduled; tech notified "authorized through P1.end" |
| CL-6 S | Rolling-start job | schedule resolved first, then periods re-planned, then rows scheduled — all in the claim transaction |
| CL-7 S | Two concurrent claims | existing lock: one claim; exactly one outbox row |
| CL-8 S | Claim gate with `partially_funded` | allowed |
| CL-9 S | Claim gate with `unfunded` and no waiver | refused (existing message) |
| CL-10 S | `legacy_exempt` job claim | no outbox rows; no gate (legacy behaviour) |

## 4. Scheduler / runner (`Funding::CollectionRunner`, rake, internal endpoint) — PR-3, PR-4

| ID | Case | Expect |
|---|---|---|
| SC-1 S | Row `run_at` in past, flags on | leased → `collect!` called with row's idempotency key and amount |
| SC-2 S | Row `run_at` in future | untouched |
| SC-3 S | `scheduler_enabled=false` | dry-run log only; rows untouched |
| SC-4 S | Kill switch ENV | runner exits; no DB writes |
| SC-5 S | Two runners concurrently (Postgres) | advisory lock → second exits; no double lease |
| SC-6 S | Expired lease | row re-leasable; same key reused (< 23 h) |
| SC-7 S | Definitive decline, attempts 1/3 | row `failed`; clone `pending` with backoff; new key suffix `_a2` |
| SC-8 S | attempts == max | `exhausted`; period `funding_failed`; notifications |
| SC-9 S | Stripe timeout (`outcome_unknown`) | row `outcome_unknown`; next run reconciles by PI id / metadata search; no new key within 23 h |
| SC-10 S | Period voided between schedule and run | row `canceled`; no Stripe call |
| SC-11 S | Job terminated/finished | same as SC-10 |
| SC-12 S | ACH processing result | row `awaiting_webhook`; period `collecting`; **not** funded |
| SC-13 S | `requires_action` | row `awaiting_action`; company notified; reminder scheduled |
| SC-14 S | Batch cap | at most MAX_BATCH rows per run |
| SC-15 S | One row raises unexpected error | others still processed; row attempts += 1 |
| SC-16 S | ACH requested but `AchAccess` denies | fail-closed; row `failed(ach_disabled)`; falls back only if company default is a card and D-7 allows |
| SC-17 C | `POST /internal/funding/run_due_collections` without secret | 401/403 |
| SC-18 C | With `X-Payments-Cron-Secret` | runs; JSON summary |
| SC-19 S | Auto-pause scan: due passed, period not funded, `auto_pause_enabled` | job paused with correct reason |
| SC-20 S | Auto-pause scan with flag off | admin alert only, no pause |
| SC-21 U | Idempotency key format and uniqueness across periods with same amount | distinct keys per sequence/revision/attempt |

## 5. Webhooks — PR-4, PR-5

| ID | Case | Expect |
|---|---|---|
| WH-1 W | `payment_intent.succeeded` for seq > 1 | period `funded`; `work_authorized_through_on` extended; job **not** re-published; no `go_live_at` change |
| WH-2 W | `payment_intent.succeeded` for seq 1 on `pending_funding` job | publishes (existing) + period funded |
| WH-3 W | `payment_intent.payment_failed` for a period charge | row `failed`; period `funding_failed`; if due passed and pause flag on → paused |
| WH-4 W | Success webhook arrives before runner writes PI id | located via `metadata.transaction_id`; no duplicate txn |
| WH-5 W | Failed-after-succeeded signal on period charge | existing investigation path + `PaymentRiskEvent`; period stays `funded`; transfer blocked |
| WH-6 W | `charge.dispute.created` on a period charge (ACH return) | `PaymentRiskEvent` blocking; job paused `dispute_or_return`; no clawback; no transfer |
| WH-7 W | Duplicate event delivery | `StripeWebhookEvent` idempotency; single state change |
| WH-8 W | Success for a `voided` period (late ACH) | funds recorded; period flagged anomaly; admin case; refundable surplus |

## 6. Work authorization gate — PR-5

| ID | Case | Expect |
|---|---|---|
| WA-1 C | Time entry dated ≤ `work_authorized_through_on`, not paused | accepted |
| WA-2 C | Dated after `work_authorized_through_on` | 422 with funding reason |
| WA-3 C | Paused; entry dated `< paused_on` | accepted (R7) |
| WA-4 C | Paused; entry dated `>= paused_on` | 422 with pause reason |
| WA-5 C | Approve/reject existing entries while paused | allowed |
| WA-6 C | `legacy_exempt` / `whole_job_upfront` job | gate not applied |
| WA-7 U | `effective_status` precedence | `paused` > `awaiting_funding` > `active` |
| WA-8 C | Exempt job claimed, start reached, P1 unfunded | `awaiting_funding`; entries refused |

## 7. Pause / resume — PR-5

| ID | Case | Expect |
|---|---|---|
| PR-1 S | `pause!(funding_not_received)` | fields set; `status` unchanged; audit; two notifications |
| PR-2 S | `pause!(ach_processing)` | copy says clearing; `funding_status` unchanged |
| PR-3 S | Auto-resume on funded | fields cleared; `work_authorized_through_on` extended; audit; notifications |
| PR-4 C | Admin resume while period unfunded | refused |
| PR-5 C | Admin pause/resume authorization | admin only |
| PR-6 S | Terminate while paused | existing termination; worked hours settle; future periods voided |
| PR-7 S | Pause twice | idempotent |
| PR-8 S | Pause never alters approved pay lines / ledger | assert unchanged |

## 8. Ledger and payout safety — PR-1, PR-4, PR-5

| ID | Case | Expect |
|---|---|---|
| LP-1 S | Multi-period job, all periods funded, finished | `fully_funded` true; `release_to_technician` succeeds; `source_transaction_decision` → `platform_balance` |
| LP-2 S | Period 2 `processing` at finish | release blocked (processing collections) |
| LP-3 S | Period 2 never collected, job terminated after period 1 | required truncated; `fully_funded` true; worked hours paid; no transfer > net funded |
| LP-4 S | Period 2 never collected, guaranteed pay, finished without termination | `settle!` collects `final_hours_top_up` or `settlement_blocked`; no transfer |
| LP-5 S | Unused funded period on termination | `period_funding_refund` refund; `amount_refundable_cents` matches |
| LP-6 S | Dispute on period 1 after transfer | `PaymentRiskEvent` only; no reversal |
| LP-7 U | `COLLECTION_TYPES` includes `period_funding_charge`; `REFUND_TYPES`/`SETTLEMENT_REFUND_TYPES` include `period_funding_refund` | enum tests |
| LP-8 U | `PeriodProjection` consumed/surplus per period | pay lines mapped by work date; Σ == ledger whole-job |
| LP-9 S | `payments:diagnose` on rolling jobs | reports period rows; no false "underfunded" for in-progress jobs |
| LP-10 S | Payout cap | transfer amount never exceeds `net_funded_cents` with period mixes |

## 9. Legacy / HSI — PR-1, PR-8

| ID | Case | Expect |
|---|---|---|
| LG-1 M | Backfill: job with succeeded collection | `whole_job_upfront` |
| LG-2 M | Backfill: waived job, no collections (HSI 32–38 shape) | `legacy_exempt` |
| LG-3 M | Backfill creates zero periods / outbox rows | counts 0 |
| LG-4 S | Runner/planner on `legacy_exempt` | refuse |
| LG-5 C | Admin propose conversion | proposal audit; company notified; no charge |
| LG-6 C | Company accepts conversion (on-session) | mode `rolling_two_week`; periods from today; first collection on-session; `recurring_charge_authorized_at` set |
| LG-7 C | Conversion accepted by non-owner company user / technician | 403 |
| LG-8 S | Waived company publishes after P3 | PB-7 behaviour (exempt publish, no authorization) |

## 10. API / serializers / admin — PR-4, PR-5, PR-8

| ID | Case | Expect |
|---|---|---|
| AP-1 C | Technician `GET /jobs/:id` | sees `work_authorized_through_on`, `current_period.status`, pause fields; **no** `company_required_cents`/amounts |
| AP-2 C | Company `GET /jobs/:id/funding_periods` | full plan |
| AP-3 C | `pay_now` on `funding_failed` period | new on-session attempt; `client_secret` for 3DS; success funds period and resumes |
| AP-4 C | `pay_now` on `funded` period | 422 |
| AP-5 C | Admin scheduler health | counts and oldest-due age |
| AP-6 C | Admin retry exhausted row | new pending row, audited; refused for voided period |
| AP-7 C | Flags endpoints | admin only; audit rows like `AchFeatureAudit` |
| AP-8 C | Billing history | `period_funding_charge` rows carry period dates |

## 11. Staging E2E (extend `lib/staging_ach_e2e_runner.rb`) — PR-9

| ID | Case |
|---|---|
| E-1 | Card: publish 6-week job → P1 charged → advance clock / force run → P2 charged → webhook → authorized |
| E-2 | Card decline on P2 → pause → pay_now with test card → resume |
| E-3 | ACH (test mode): P2 initiated at due−7 d → processing → success → funded before due |
| E-4 | ACH failure test account → failed → pause copy → pay by card → resume |
| E-5 | Exempt claim with start > 24 h → row at +24 h → forced run → P1 funded |
| E-6 | Termination mid-job → refunds → worked hours transfer under unchanged gates |
