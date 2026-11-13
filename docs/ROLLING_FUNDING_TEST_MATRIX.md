# Rolling Two-Week Funding — Test Matrix (rev 3)

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
| AL-5 S | Admin "adjustment" allocation | **rejected at model level** — no such `source_type`; `Allocator` exposes no method that writes cash without a succeeded transaction |
| AL-5b S | Requirement adjustment (audited `financial_revision`) lowers requirement to what verified cash covers | period becomes funded via requirement side only; `allocated_cents` unchanged; audit row present |
| AL-5c S | Requirement adjustment raises requirement above verified cash | period not funded; outbox true-up row created; no cash row created |
| AL-5d S | Admin tries to "mark funded" without a verified transaction | refused; only reconciliation (attach PI id, §8.5) or requirement adjustment paths exist |
| AL-6 S | Refund | negative allocation; coverage recomputed |
| AL-7 S | Allocation idempotent on `source_id` | double webhook/runner → single allocation |
| AL-8 S | Late success for voided period | → pool; resolver: credit forward (job continues) or `period_funding_refund` (job ended); audit row |
| AL-9 U | `verify_allocations` | Σ allocations == Σ succeeded − refunds == `JobLedger.net_funded_cents`; every row traces to a succeeded/refunded txn; fails on any orphan row |
| AL-10 S | `reserve_backing` rows | written only by an executed reserve disbursement; excluded from coverage, from `net_funded_cents` and from authorization; cannot be written while transfers disabled or ledger 0 |
| AL-12 U | labor/fee split per allocation | `labor_allocated_cents(k)` = floor(min(allocated, required) × labor/required); fee portion = remainder; partial collection split is pro rata |
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
| WA-1a U | predicate | `whole_job_upfront`, priced, verified succeeded collection covers requirement | authorized through schedule end |
| WA-1b U | predicate | `whole_job_upfront`, priced, collection `processing` (ACH) | **not** authorized |
| WA-1c U | predicate | `whole_job_upfront`, priced, collection `failed` / `canceled` / `requires_action` | **not** authorized |
| WA-1d U | predicate | `whole_job_upfront`, unpriced (`company_required_cents == 0`) | authorized (documented zero-requirement exception) |
| WA-1e U | predicate | `whole_job_upfront`, `funding_status: funded` stamp but zero succeeded collections (`legacy_funded_without_collections?`) | **not** authorized |
| WA-1f U | predicate | `whole_job_upfront`, partial refund drops net below requirement | **not** authorized for new dates |
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

## 9. Transfer policy, settlement, obligations — PR-5

| ID | Case | Expect |
|---|---|---|
| TP-1 S | legacy `whole_job_upfront` job | `release_to_technician` unchanged (regression suite: every existing gate test still passes) |
| TP-2 S | rolling, all periods funded, finished | company-funded transfer = entitlement; `platform_balance` source; `settled` |
| TP-3 S | rolling, P2 processing at finish, work only in P1 | transfer for P1 hours not blocked by P2 processing; cap holds |
| TP-4 S | rolling, P2 processing and includes paid work | blocked (processing allocated to paid period) |
| TP-5 S | available < entitlement (final collection failed) | partial company-funded transfer; obligation = shortfall; `settled_with_obligation`; obligation stays open |
| TP-6 S | invariant Σ company-funded transfers ≤ Σ **labor portion** of verified allocated cash − refunds, per job and across all jobs | property test over random sequences incl. partial collections, refunds, multiple jobs |
| TP-6b S | fee portion never transferable | job fully funded, entitlement artificially > labor portion → transfer capped at labor portion |
| TP-6c S | holds reduce availability | pending refund / in-flight transfer / risk hold / obligation against funds → cap reduced accordingly |
| TP-6d S | `stripe_constraint` | Stripe stub reports large available balance while other jobs have pending transfers/refunds → transfer limited by `PlatformBalanceReservations`, not by Stripe's balance |
| TP-6e S | cross-job isolation | job A's prepaid cash never funds job B's transfer |
| TP-7 S | obligation created while reserve ledger 0 / transfers disabled (launch state) | created `open` and moved to `escalated` in the same transaction; owner/admin, technician and company notified; obligation never auto-closes, expires or writes off |
| TP-7b S | authorize attempt while `reserve_transfers_enabled=false` | refused `RESERVE_TRANSFERS_DISABLED`; no Stripe call; stays `escalated` |
| TP-7c S | flag true but ledger balance 0 (or < amount) | refused `RESERVE_UNFUNDED`; no Stripe call |
| TP-7d S | enable flag set true with ledger 0, or without explicit confirmation, or by non-designated user | settings endpoint refuses; audit row |
| TP-7e S | enable flag set true by designated owner with confirmation and balance > 0 | allowed; audited; disabling always allowed |
| TP-7f S | day-7 escalation review | disposition required; `write_off` not an accepted disposition; `pay_out_of_band` → `paid` with external reference; `continue_recovery` requires note + date |
| TP-7g S | standing reminders | owner/admin every 7 d, technician every 14 d until `paid`/`company_recovered` |
| TP-8 S | any code path that would charge the owner, a company or a technician to fund the reserve | **does not exist** (negative test: `owner_funding` entry only records; no PaymentIntent/Transfer/Payout created) |
| TP-8b S | authorized obligation, flag on, ledger funded, `release_eligible?` | disbursement ≤ min(authorized, `reserve_available`, `stripe_constraint`); `reserve_technician_transfer` or payroll reference per `payment_rail`; ledger `disbursement` entry; `reserve_backing` mirror |
| TP-8c S | disbursement would exceed `max_exposure_cents` | refused; `reserve_available` derived correctly |
| TP-8d S | receivable recovered after reserve paid | ledger `recovery` entry; technician not paid twice |
| TP-9 S | reserve settings | target/max exposure admin-settable and audited; defaults 500000/500000; no auto-authorization key accepted; `reserve_available` = 0 on fresh install |
| TP-10 S | `reserve_technician_transfer` / `reserve_backing` rows | excluded from coverage/`net_funded_cents`/authorization; never reduce company receivable |
| TP-11 S | receivable recovery | company collection succeeded → verified labor allocation to the job → `RollingTransferPolicy` pays technician → obligation `company_recovered`; never touches technician |
| TP-11b S | receivable written off | receivable closed; **obligation remains open** (never extinguished) |
| TP-12 S | company with open receivable publishes priced job | blocked |
| TP-13 S | `settlement_sequence` increments per event; keys unique | two settlement events → two transfers, distinct keys |
| TP-14 S | pause-deadline termination | settlement + payout clock starts |
| TP-15 S | ACH return after transfer | `PaymentRiskEvent`; no reversal; obligation/receivable recorded and escalated; technician unaffected; reserve payment only if enabled and funded |
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
| AP-9 C | obligations / receivables / reserve endpoints | admin only; dispositions append-only; `authorize` refused while disabled/unfunded; reserve ledger POST records only (never charges); enable flag guarded |

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
| E-9 | Final collection failure → partial company transfer (labor-capped) + escalated obligation + receivable → company pays receivable → technician paid from recovered cash → obligation `company_recovered` |
| E-11 | Staging only: owner records `owner_funding` (no charge created — assert zero new Stripe objects), enables flag with confirmation, authorizes an escalated obligation → single bounded reserve disbursement → ledger balance and exposure correct → receivable recovery replenishes ledger |
| E-10 | Pause 7 d → auto early termination → settlement |
