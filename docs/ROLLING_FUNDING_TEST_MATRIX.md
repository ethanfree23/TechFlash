# Rolling Two-Week Funding — Test Matrix (rev 2)

Companion to `docs/ROLLING_TWO_WEEK_FUNDING_ARCHITECTURE.md`. Lists the tests each implementation PR must ship (PR numbers per §19 of the architecture doc). Framework: Minitest, following `skilled_hub_api/test/services/*` and `test/controllers/api/v1/*`. CI runs on SQLite (`.github/workflows`), so Postgres-only constructs (`FOR UPDATE SKIP LOCKED`) must be adapter-guarded and covered by an additional Postgres CI job (PR-10).

Legend: **U** unit, **S** service, **C** controller/API, **W** webhook, **M** migration/backfill, **E** staging E2E (Stripe test mode).

## 1. Period planning (`Funding::PeriodPlanner`) — PR-2

| ID | Case | Expect |
|---|---|---|
| PP-1 U | 5 working days Mon–Fri | 1 period; amount == `company_charge_cents` |
| PP-2 U | 6 weeks Mon–Fri 8 h | 3 periods × 10 days; Σ labor == `job_amount_cents` |
| PP-3 U | 3 weeks Mon–Thu | 8 + 4 working days |
| PP-4 U | Period with zero working days | created, requirement 0, auto-funded |
| PP-5 U | Rounding residue | ≤ n−1 cents in last period |
| PP-6 U | Guaranteed pay proration | floor per period, remainder last |
| PP-7 U | Differing `standard_day_shifts` hours | summed per date |
| PP-8 U | Accepted weekend request inside period | adjustment at hours × multiplier |
| PP-9 U | DST boundary in `job_timezone` | `funding_due_at` = local midnight |
| PP-10 U | `hard_deadline_at` earlier than end | clipped |
| PP-11 S | Re-plan after counteroffer | unfunded voided, funded kept, pending rows canceled |
| PP-12 S | `extend` | periods appended; current period adjusted if inside window |
| PP-13 S | Termination mid-period 2 | ≥ 3 voided; credit refund scheduled |
| PP-14 S | Planner on `whole_job_upfront` / `legacy_exempt` | no-op / refuses |
| PP-15 S | Rolling-start before claim | `projected`; replaced on claim |
| PP-16 U | Lead-time shift for weekend / US bank holiday (D-5) | card initiate on preceding business day; ACH keeps ≥ 5 banking days |

## 2. Allocation (`Funding::Allocator`, `ExcessCollectionResolver`) — PR-2, PR-6

| ID | Case | Expect |
|---|---|---|
| AL-1 S | Succeeded collection == requirement | one allocation; period funded |
| AL-2 S | Two partial collections (e.g. pay_now after partial) | sum covers → funded; neither alone funds |
| AL-3 S | Collection > requirement | surplus → pool allocation |
| AL-4 S | Pool credit applied before scheduling | `credit_transfer` pair; outbox amount reduced; zero → funded without Stripe |
| AL-5 S | Approved adjustment (admin) | counts toward coverage; reason required |
| AL-6 S | Refund | negative allocation; coverage recomputed |
| AL-7 S | Allocation idempotent on `source_id` | double webhook/runner → single allocation |
| AL-8 S | Late success for voided period | → pool; resolver: credit forward (job continues) or `period_funding_refund` (job ended); audit row |
| AL-9 U | `verify_allocations` | Σ allocations == Σ succeeded − refunds == `JobLedger.net_funded_cents` |
| AL-10 S | `reserve_advance` rows | excluded from coverage and from `net_funded_cents` |
| AL-11 S | Rows are append-only | update/delete raises |

## 3. Publish — PR-6

| ID | Case | Expect |
|---|---|---|
| PB-1 C | Flags on, card succeeds, n>1 | `period_funding_charge` seq 1 allocated; `open`, `partially_funded`; P2..n scheduled at due−lead; `work_authorized_through_on = P1.end` |
| PB-2 C | n == 1 | `funded`; no outbox rows |
| PB-3 C | Card `requires_action` | existing 3DS path; after confirm → PB-1 |
| PB-4 C | Card declined | `funding_failed`; nothing scheduled |
| PB-5 C | ACH processing | `pending_funding`; P1 `collecting`; webhook success → PB-1; `publish!` once |
| PB-6 C | ACH failure webhook | P1 `funding_failed`; unpublished |
| PB-7 C | Waived company | P2 behaviour + mode `rolling_two_week`, periods `planned`, **no** outbox rows, `work_authorized_through_on` nil |
| PB-8 C | Unpriced | `funded`, mode `whole_job_upfront` |
| PB-9 C | Global on, company off | legacy whole-job charge |
| PB-10 C | `ROLLING_FUNDING_DISABLED=1` | legacy charge; enforcement unaffected |
| PB-11 C | `rolling_funding_enabled` while `enforcement_enabled` off | settings endpoint refuses |
| PB-12 C | Company without recurring-charge consent | publish refused with CTA |
| PB-13 C | Double publish | single txn (unique key) |

## 4. Claim — PR-6

| ID | Case | Expect |
|---|---|---|
| CL-1 S | Exempt, start = claim + 48 h | `deferred_initial` `run_at = claim + 24 h`; no Stripe call during claim |
| CL-2 S | Exempt, start = claim + 12 h | `run_at = now`; best-effort inline attempt after commit; row survives inline failure |
| CL-3 S | Exempt, start = claim + 24 h exactly | immediate |
| CL-4 S | Exempt, no payment method | row created; runner `failed(no_payment_method)`; notifications; not authorized |
| CL-5 S | Normally funded rolling | no deferred row; tech told "authorized through P1.end" |
| CL-6 S | Rolling-start | schedule → re-plan → rows, one transaction |
| CL-7 S | Concurrent claims | one claim; one row |
| CL-8 S | `partially_funded` | claim allowed |
| CL-9 S | `unfunded`, no marker | refused |
| CL-10 S | `legacy_exempt` | claim allowed (grandfathered visibility); **not authorized**; no outbox rows; no debit |
| CL-11 S | Exempt, ACH default, start in 3 days (< ACH lead) | claim ok; `start_at_risk`; payload offers exactly `pay_now_card` and `propose_later_start`; no override flag exists |
| CL-12 S | Claim never sets `work_authorized_through_on` | assert nil/unchanged after claim |

## 5. Scheduler, leasing, reconciliation (`CollectionRunner`, `CollectionReconciler`) — PR-4, PR-6

| ID | Case | Expect |
|---|---|---|
| SC-1 S | Due row, flags on | leased in short txn; Stripe called outside txn; result written in second txn |
| SC-2 S | Future row | untouched |
| SC-3 S | `scheduler_enabled=false` | dry-run log only |
| SC-4 S | Kill switch | exits before leasing; no writes except heartbeat |
| SC-5 S | Two runners concurrently (Postgres) | `SKIP LOCKED` → disjoint rows; no advisory lock used |
| SC-6 S | `MAX_RUNTIME_SECONDS` reached | stops leasing; `hit_runtime_limit` recorded; remaining rows next run |
| SC-7 S | Definitive decline, attempts 1/3 | `failed`; clone `pending` with backoff and `_a2` key |
| SC-8 S | attempts == max | `exhausted`; period `funding_failed`; notifications |
| SC-9 S | Ambiguous Stripe error | `outcome_unknown`; no new key |
| SC-10 S | Expired lease, `stripe_request_started_at` nil | → `pending`, same key |
| SC-11 S | Expired lease, PI id recorded, PI succeeded | reconciler applies success + allocation; **no second charge** |
| SC-12 S | Expired lease, request started, no PI id, search finds PI | applied |
| SC-13 S | Expired lease, not found, < 23 h | `pending`, same key; Stripe stub asserts same `Idempotency-Key` |
| SC-14 S | Expired lease, not found, ≥ 23 h | `needs_admin_reconciliation`; never auto-new key |
| SC-15 S | Search attempted < 15 min after request | reconciler waits (index lag) |
| SC-16 S | `awaiting_webhook` > 6 business days | retrieve PI; apply or escalate |
| SC-17 S | Period voided before run | row `canceled`; no Stripe call |
| SC-18 S | Cancel requested while PI processing | `PaymentIntent.cancel` attempted; refused → `cancel_refused_processing`; txn not marked canceled locally |
| SC-19 S | ACH processing result | `awaiting_webhook`; period not funded |
| SC-20 S | `requires_action` | `awaiting_action`; notify; reminder |
| SC-21 S | Batch cap | ≤ `MAX_BATCH` |
| SC-22 S | One row raises | others processed; attempts unchanged for non-definitive error |
| SC-23 S | `AchAccess` denies | fail-closed `failed(ach_disabled)` |
| SC-24 C | Internal trigger without secret | 401/403 |
| SC-25 C | With secret | runs with same bounds; JSON summary |
| SC-26 S | Auto-pause: due passed, not funded, flag on | paused, correct reason |
| SC-27 S | Auto-pause flag off | alert only |
| SC-28 S | Heartbeat row written start/finish | counts correct |
| SC-29 U | Monitoring thresholds | missed run 45 min; overdue 60 min; stuck lease 30 min; reconciliation > 0 |
| SC-30 U | Key format uniqueness | distinct per sequence/revision/attempt |

## 6. Webhooks — PR-6

| ID | Case | Expect |
|---|---|---|
| WH-1 W | `payment_intent.succeeded`, seq > 1 | allocation; period funded; authorization extended; no `publish!`; `go_live_at` unchanged |
| WH-2 W | succeeded, seq 1 on `pending_funding` | publishes + funds |
| WH-3 W | `payment_failed` on period charge | row/period failed; pause if due passed and flag on |
| WH-4 W | Webhook before runner wrote PI id | located by `metadata.transaction_id`; no duplicate txn; row reconciled |
| WH-5 W | Failed-after-succeeded signal | investigation + `PaymentRiskEvent`; period stays funded; company-funded transfer blocked |
| WH-6 W | Dispute on period charge (ACH return) | blocking event; pause `dispute_or_return`; no clawback; obligation path available |
| WH-7 W | Duplicate delivery | single state change |
| WH-8 W | Success for voided period (late ACH) | pool + resolver outcome + audit |
| WH-9 W | Webhook for `cancel_refused_processing` row | outcome applied; row closed |

## 7. Work authorization at every entry point — PR-3

| ID | Entry point | Case | Expect |
|---|---|---|---|
| WA-1 U | predicate | `whole_job_upfront` | authorized through schedule |
| WA-2 U | predicate | `legacy_exempt`, no decision | **not** authorized |
| WA-3 U | predicate | override_until set | authorized ≤ that date only |
| WA-4 U | `effective_status` | claimed, start reached, not authorized | `awaiting_funding`, never `active` |
| WA-5 U | `effective_status` | paused | `paused` precedence over `awaiting_funding` |
| WA-6 C | activation / start-work action | not authorized | refused with reason |
| WA-7 C | `TimeEntriesController#create` | date ≤ authorized_through, not paused | accepted |
| WA-8 C | `#create` | date > authorized_through | 422 funding reason |
| WA-9 C | `#create` | paused, date < paused_on | accepted (R7) |
| WA-10 C | `#create` | paused, date ≥ paused_on | 422 pause reason |
| WA-11 C | `#approve` | entry date unauthorized, no override | refused; no pay line |
| WA-12 C | `#approve` | admin override with reason | approved; pay line created; obligation candidate flagged; audit |
| WA-13 S | `Compensation::Calculator` | unauthorized date without override | raises |
| WA-14 S | counteroffer acceptance | re-plan; `work_authorized_through_on` unchanged |
| WA-15 S | schedule proposal / `extend` | authorization not extended beyond funded periods |
| WA-16 S | weekend request acceptance | refused beyond authorization unless funded or marked subject-to-funding |
| WA-17 S | `PeriodStateService.mark_funded!` | only writer that advances `work_authorized_through_on` |
| WA-18 S | time passes (`travel_to` start + 1 day) | no state change without funding |

## 8. Pause / resume / deadline — PR-3

| ID | Case | Expect |
|---|---|---|
| PR-1 S | each `pause_reason` | fields set; `status` unchanged; audit; two notifications |
| PR-2 S | `ach_processing` copy | "clearing", `funding_status` unchanged |
| PR-3 S | auto-resume on funded | cleared; authorized_through extended; audit |
| PR-4 C | admin resume while unfunded | refused |
| PR-5 C | authorization | admin only |
| PR-6 S | terminate while paused | existing termination; earned hours settle; future voided |
| PR-7 S | pause idempotent | second call no-op |
| PR-8 S | approved pay lines / allocations untouched by pause | assert |
| PR-9 S | paused 7 days (`pause_settlement_days`) | `TerminateAssignmentService(company_funding_lapsed)`; reminders day 3, 5 |
| PR-10 S | resume keeps original dates (D-9) | schedule unchanged; lost days → credit |
| PR-11 S | reschedule via proposal after resume | re-plan |
| PR-12 S | audit rows immutable | update raises |

## 9. Transfer policy, settlement, reserve — PR-5

| ID | Case | Expect |
|---|---|---|
| TP-1 S | legacy `whole_job_upfront` job | `release_to_technician` unchanged (regression suite: every existing gate test still passes) |
| TP-2 S | rolling, all periods funded, finished | company-funded transfer = entitlement; `platform_balance` source; `settled` |
| TP-3 S | rolling, P2 processing at finish, work only in P1 | transfer for P1 hours not blocked by P2 processing; cap holds |
| TP-4 S | rolling, P2 processing and includes paid work | blocked (processing allocated to paid period) |
| TP-5 S | available < entitlement (final collection failed) | partial company-funded transfer; obligation = shortfall; `settled_with_receivable` after reserve pays |
| TP-6 S | invariant Σ company-funded transfers ≤ Σ succeeded − refunds | property test over random sequences |
| TP-7 S | obligation without admin authorization | not paid; cron skips |
| TP-8 S | obligation authorized, `release_eligible?` | `reserve_technician_transfer` from platform balance; receivable opened |
| TP-9 S | reserve cap exceeded | authorization refused |
| TP-10 S | reserve transfer excluded from coverage/`net_funded_cents` | assert |
| TP-11 S | receivable recovery | company collection; receivable `recovered`; never touches technician |
| TP-12 S | company with open receivable publishes priced job | blocked |
| TP-13 S | `settlement_sequence` increments per event; keys unique | two settlement events → two transfers, distinct keys |
| TP-14 S | pause-deadline termination | settlement + payout clock starts |
| TP-15 S | ACH return after transfer | `PaymentRiskEvent`; no reversal; obligation/receivable path; technician unaffected |
| TP-16 S | pending refund / blocking risk event / missing snapshot | blocked as today |
| TP-17 S | D-6 credit refund at completion | `period_funding_refund` for pool remainder |
| TP-18 S | D-4 immediate top-up | approval exceeding coverage → `true_up` row `run_at: now`; `coverage_exceeded`; authorization does not advance until funded |
| TP-19 S | D-4 next-cycle billing | overage within coverage → added to next period's `pending_adjustment_cents` |

## 10. Legacy / HSI — PR-1, PR-3, PR-9

| ID | Case | Expect |
|---|---|---|
| LG-1 M | job with succeeded collection | `whole_job_upfront` |
| LG-2 M | marker true, no collections (HSI 32–38 shape) | `legacy_exempt` |
| LG-3 M | `legacy_funded_without_collections?` without marker | NULL mode + admin case |
| LG-4 M | backfill creates zero periods / rows / allocations | counts 0 |
| LG-5 S | planner/runner on `legacy_exempt` | refuse |
| LG-6 C | `legacy_exempt` time entry for new date, enforcement on | refused |
| LG-7 C | `legacy_exempt` previously approved hours | untouched, payable under legacy gate |
| LG-8 C | admin override_until | authorized ≤ date; audit; dashboard lists it |
| LG-9 C | propose conversion | audit; notification; no charge |
| LG-10 C | accept conversion (on-session) | mode rolling; P1 on-session; consent recorded |
| LG-11 C | accept by non-owner / technician | 403 |
| LG-12 S | any automatic debit path on `legacy_exempt` | none exists (negative test: runner, settlement, true-up all refuse) |
| LG-13 S | `legacy_exempt_report` rake | read-only; lists claim/time-entry status |

## 11. API / serializers / admin — PR-5, PR-6, PR-9

| ID | Case | Expect |
|---|---|---|
| AP-1 C | Technician `GET /jobs/:id` | authorization + period status; no company amounts |
| AP-2 C | Company funding_periods | full plan incl. allocations |
| AP-3 C | `pay_now` on failed / at-risk period | on-session; `client_secret`; success allocates and resumes |
| AP-4 C | `pay_now` on funded period | 422 |
| AP-5 C | scheduler health | counts, oldest-due, stuck, reconciliation |
| AP-6 C | admin retry exhausted / resolve reconciliation | audited; refused for voided period |
| AP-7 C | flags endpoints | admin only; audit; enforcement-before-enable rule |
| AP-8 C | billing history | period charges/refunds with period dates |
| AP-9 C | obligations / receivables endpoints | admin only; authorization single-use |

## 12. Staging E2E (extend `lib/staging_ach_e2e_runner.rb`) — PR-10

| ID | Case |
|---|---|
| E-1 | Card: 6-week job → P1 → forced run P2 → webhook → authorized |
| E-2 | Decline on P2 → pause → pay_now → resume |
| E-3 | Kill runner between Stripe call and DB write → lease expiry → reconciler applies → exactly one charge |
| E-4 | ACH: P2 at due−7 d → processing → success before due |
| E-5 | ACH failure account → pause copy → card pay → resume |
| E-6 | Exempt claim start > 24 h → row at +24 h → forced run → funded |
| E-7 | Exempt claim, ACH default, start in 3 d → start_at_risk → card pay now |
| E-8 | Termination mid-job → voids, credit refund, earned-hours transfer |
| E-9 | Final collection failure → partial company transfer + obligation → admin authorizes → reserve transfer → receivable |
| E-10 | Pause 7 d → auto early termination → settlement |
