# Rolling Two-Week Funding — State Machines (rev 2)

Companion to `docs/ROLLING_TWO_WEEK_FUNDING_ARCHITECTURE.md`. Design only; nothing here is implemented.

## 1. Five independent concepts

| Concept | Field(s) | Values |
|---|---|---|
| Posting visibility | `jobs.status`, `go_live_at` | existing enum, unchanged |
| Claim eligibility | derived: `available_for_claim? && funding_allows_claim?` (P2, + `partially_funded`) | boolean |
| Funding coverage | `job_funding_periods.status`, `job_funding_allocations`, `jobs.funding_status` (+ `partially_funded`) | §3, §4 |
| Work authorization | `work_authorized_through_on`, `paused_on`, `admin_work_authorization_override_until`, `funding_mode` | derived per date, §6 |
| Operational | `paused_at`, `pause_reason`, `terminated_at`, `finished_at` → `effective_status` | `open`, `claimed`, `awaiting_funding`, `active`, `paused`, `ended_early`, `completed`, `expired`, `draft`, `pending_funding` |

A transition in one concept never implicitly changes another; services that move two concepts do so explicitly, in one transaction, under the Job row lock. **Dates never cause transitions in funding coverage or work authorization.**

## 2. `jobs.funding_status` (extended)

```
unfunded ──period 1 allocated-funded (n>1)──► partially_funded ──all periods funded / ledger due 0──► funded
unfunded ──whole-job or single-period succeeded──► funded
any ──definitive collection failure──► funding_failed ──pay_now/retry succeeded──► partially_funded|funded
any ──3DS/ACH processing on publish──► adjustment_required (existing) ──succeeded──► partially_funded|funded
```

`funded` keeps P2's strict meaning (`JobLedger.fully_funded` or vacuous unpriced). `posted_under_funding_waiver` is orthogonal (publication-only exemption).

## 3. `job_funding_periods.status`

```
projected ──claim resolves schedule──► planned
planned ──outbox row created──► collection_scheduled
collection_scheduled ──runner leases row──► collecting
collecting ──allocated_cents >= required_cents──► funded
collecting ──PI processing (ACH)──► collecting (awaiting webhook; NOT funded)
collecting ──PI requires_action──► action_required ──on-session confirm & allocation covers──► funded
collecting|action_required ──definitive failure, retries exhausted──► funding_failed
funding_failed|collecting|action_required ──funding_due_at reached──► paused_unfunded  (job paused)
paused_unfunded ──allocation covers requirement──► funded                               (job resumed)
funded ──approved hours exceed allocation──► coverage_exceeded ──true-up allocated──► funded
funded|coverage_exceeded ──period_end_on passed & pay lines settled──► closed
planned|collection_scheduled|collecting|funding_failed|paused_unfunded ──termination/finish/re-plan──► voided
```

Invariants:

- Only `Funding::PeriodStateService` writes `status`.
- `funded` ⇔ Σ `job_funding_allocations` for the period (excluding `reserve_advance`) ≥ `company_required_cents + pending_adjustment_cents`, or requirement 0. Multiple partial collections, pool credit and approved adjustments all count; **no single transaction is required or sufficient**.
- `voided` periods never receive new allocations; late-arriving money for them goes to the pool and is resolved by `ExcessCollectionResolver` (credit forward or refund, audited).
- Every succeeded collection on a rolling job is fully allocated (periods + pool) — `funding:verify_allocations` asserts `Σ allocations == Σ succeeded collections − Σ refunds == JobLedger.net_funded_cents`.

## 4. `job_funding_allocations` (append-only)

```
collection(+)  : succeeded period_funding_charge / final_hours_top_up → target period up to need, surplus → pool
refund(−)      : period_funding_refund / cancellation refund → from pool or period it reduces
credit_transfer: paired (−pool, +period) when pool credit is applied before a collection, or (−voided period, +pool)
approved_adjustment(±): admin, reason required
reserve_advance: informational mirror of a reserve_technician_transfer; excluded from coverage math
```

Rows are never updated or deleted; corrections are new rows.

## 5. `scheduled_funding_collections.status` (outbox)

```
pending ──run_at <= now, leased (FOR UPDATE SKIP LOCKED, short txn)──► leased
leased ──Stripe succeeded──► succeeded
leased ──Stripe processing──► awaiting_webhook ──webhook succeeded──► succeeded
                                            └──webhook failed──► failed
leased ──Stripe requires_action──► awaiting_action ──confirm ok──► succeeded
                                                 └──due reached──► failed
leased ──definitive failure, attempts < max──► failed  (+ new pending row, same period, next attempt suffix)
leased ──definitive failure, attempts == max──► exhausted
leased ──ambiguous error / timeout──► outcome_unknown
leased ──lease_until passed──► (reconciler) ──see below
pending|failed|outcome_unknown ──period voided / flags off / admin cancel──► canceled   (only if no Stripe request started)
leased|awaiting_webhook ──cancel requested while PI processing──► cancel_refused_processing (debit continues; reconcile on outcome)
exhausted ──admin retry (audited)──► pending (new attempt suffix)
outcome_unknown|expired lease ──not found in Stripe after 23 h──► needs_admin_reconciliation ──admin resolves──► failed|succeeded
```

**Expired-lease rule:** an expired lease never returns directly to `pending` and never re-creates a charge. `Funding::CollectionReconciler` first determines the prior Stripe outcome:

1. `stripe_request_started_at` nil → no request was made → `pending` (same key).
2. `stripe_payment_intent_id` present → `PaymentIntent.retrieve` → apply its state.
3. Request started, no PI id → look up the `JobPaymentTransaction` by key, then `PaymentIntent.search` on `metadata['scheduled_funding_collection_id']` (after ≥ 15 min for index lag). Found → apply. Not found and < 23 h since request → `pending`, **same idempotency key**. Not found and ≥ 23 h → `needs_admin_reconciliation`; no new key is ever minted automatically.

Idempotency key: `tf_job_<job_id>_period_<sequence>_pfc_r<financial_revision>_a<attempt>`; `attempt` increments only on a definitive failure.

## 6. Work authorization (derived; enforced at every entry point)

```
authorized_on?(d) =
  job.status ∈ {reserved, filled}
  ∧ ( funding_mode == whole_job_upfront
    ∨ ( work_authorized_through_on.present? ∧ d <= work_authorized_through_on
        ∧ (paused_on.nil? ∨ d < paused_on) )
    ∨ ( admin_work_authorization_override_until.present? ∧ d <= admin_work_authorization_override_until ) )
```

- `legacy_exempt` jobs satisfy no clause until a deliberate decision (conversion, whole-job payment, or audited override).
- `work_authorized_through_on` advances only in `PeriodStateService.mark_funded!`; it never advances on claim, on `scheduled_start_at`, on `period_start_on`, on schedule changes, or by the passage of time.
- Enforcement points: `effective_status`, activation / start-work actions, `ClaimJobService` result, counteroffer / schedule proposal / `extend` / weekend-request acceptance (re-plan only, never authorize), `TimeEntriesController#create`, `#approve` → `create_pay_line!`, `Compensation::Calculator`, `RollingSettlement` (entitlement = approved pay lines on authorized or override-approved dates).

## 7. Operational (`effective_status`)

```
existing: draft | pending_funding | open | claimed | active | completed | ended_early | expired
new:
  awaiting_funding : claimed ∧ scheduled_start_at <= now ∧ ¬authorized_now?(today) ∧ paused_at.nil?
  paused           : claimed ∧ paused_at.present?
  active           : claimed ∧ scheduled_start_at <= now ∧ authorized_now?(today)
precedence: ended_early > completed > paused > awaiting_funding > active > claimed > open
```

## 8. Pause / resume / deadline

```
active|awaiting_funding ──pause!(reason)──► paused
   reasons: funding_not_received | ach_processing | payment_action_required | coverage_exceeded_unpaid | dispute_or_return | admin
paused ──blocking period funded (allocation covers)──► active        (auto; authorized_through = period.end)
paused ──admin resume──► active                                       (only if current period funded ∧ no blocking PaymentRiskEvent)
paused ──7 calendar days (rolling_funding_pause_settlement_days)──► ended_early via TerminateAssignmentService(company_funding_lapsed)
paused ──company/admin terminate──► ended_early
```

Effects: `status` unchanged; entries dated `< paused_on` remain submittable/approvable; immutable audit row (`job_term_change_audits`, `change_type: funding_pause|funding_resume`); both parties notified. Schedule dates are kept after resume unless both parties reschedule (D-9).

## 9. Transfer eligibility (rolling jobs) and obligations

```
settlement event (finish | termination | pause-deadline termination)
  └─ RollingSettlement: attempt final collection / refund credit  (outcome does NOT gate step below)
  └─ RollingTransferPolicy:
       available = Σ succeeded collection allocations − refunds − company-funded transfers − reserved
       company_funded_transfer = min(unpaid entitlement, available)   → technician_transfer (key ..._s<settlement_sequence>)
       shortfall = entitlement − company_funded_transfer              → technician_compensation_obligation(open)
obligation: open ──admin authorizes (amount-bound, single-use)──► authorized ──release_eligible & cron──► paid (reserve_technician_transfer)
                                                                                                  └─► company_receivable(open) ──recovered|written_off
```

Preserved guards for every transfer: technician snapshot, Connect `payout_ready`, no pending refunds, no blocking `PaymentRiskEvent`, no processing collection allocated to a period included in the payout, idempotent key, 23 h outcome-unknown discipline, `TransferRetryAuthorization` for retries. Legacy modes use the unchanged whole-job gate.

## 10. End-to-end flows

### Normal rolling posting

```
draft ─publish (card ok)─► open · partially_funded · P1 funded (allocation) · P2..n collection_scheduled · authorized_through = P1.end
  └─claim─► filled · schedule resolved → re-plan · tech told "authorized through <date>"
      └─start date─► active (only because authorized_on?(today))
          ├─P2 collected at due−lead → allocation covers → funded → authorized_through = P2.end
          ├─P2 fails & due reached → paused → pay_now (card) → funded → active
          ├─paused 7 d → ended_early(company_funding_lapsed) → settle earned hours → payout (72 h / ratings)
          ├─company terminates → ended_early · future periods voided · credit refunded · earned hours settled
          └─last period ends → finish → RollingSettlement → transfer(s) under unchanged schedule
```

### Admin-exempt posting

```
draft ─publish (waived)─► open · unfunded · posted_under_funding_waiver · P1..n planned · NOT authorized
  └─claim at T
      ├─start > T+24h → outbox deferred_initial run_at = T+24h
      └─start ≤ T+24h → outbox deferred_initial run_at = T (+ best-effort inline attempt after commit)
          ├─start earlier than earliest_fundable_at (e.g. ACH default) → start_at_risk →
          │     company chooses: pay now by card (on-session, authorized)  |  propose later start.  No override, no credit.
          ├─P1 funded → partially_funded|funded · authorized_through = P1.end · P2..n scheduled
          └─P1 not funded by start → awaiting_funding (no activation, no time entries) → due passes → paused(funding_not_received)
```

### Legacy exempt (HSI #32–38)

```
open (grandfathered visibility, claimable) · funding_mode legacy_exempt · NOT authorized once enforcement is on
  ├─company converts (two-step, on-session P1) → rolling_two_week → normal flow
  ├─company pays whole job on-session → whole_job_upfront → authorized through schedule end
  └─admin override_until (audited, time-bounded) → authorized through that date only
never: automatic debit of any kind
```
