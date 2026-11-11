# Rolling Two-Week Funding — State Machines

Companion to `docs/ROLLING_TWO_WEEK_FUNDING_ARCHITECTURE.md`. Design only; nothing here is implemented.

## 1. Five independent concepts

| Concept | Field(s) | Values |
|---|---|---|
| Posting visibility | `jobs.status`, `go_live_at` | `draft`, `pending_funding`, `open`, `filled`, `reserved`, `finished`, `completed` (existing enum, unchanged) |
| Claim eligibility | derived: `available_for_claim? && funding_allows_claim?` | boolean |
| Funding | `jobs.funding_status` (+ `partially_funded`), `job_funding_periods.status`, `JobLedger` | see §3 |
| Work authorization | `jobs.work_authorized_through_on`, `paused_at`, `paused_on` | derived per date |
| Operational | `paused_at`, `pause_reason`, `terminated_at`, `finished_at` → `effective_status` | `open`, `claimed`, `active`, `awaiting_funding`, `paused`, `ended_early`, `completed`, `expired`, `draft`, `pending_funding` |

Rule: a transition in one concept never *implicitly* changes another. Services that need to move two concepts do so explicitly, in one transaction, under the Job row lock.

## 2. `jobs.funding_status` (extended)

```
unfunded ──period 1 succeeded (n>1)──► partially_funded ──all periods funded / ledger due 0──► funded
unfunded ──whole-job or single-period succeeded──► funded
any ──definitive collection failure before due──► funding_failed ──pay_now/retry succeeded──► partially_funded|funded
any ──3DS/ACH processing on publish──► adjustment_required (existing) ──succeeded──► partially_funded|funded
```

- `funded` keeps P2's strict meaning: `JobLedger.fully_funded` (whole job).
- `partially_funded` is **claimable** (`funding_allows_claim?`) and locks pay terms (`funded_terms_locked?`).
- `posted_under_funding_waiver: true` is orthogonal: it permits visibility/claim while `funding_status` is `unfunded`.

## 3. `job_funding_periods.status`

```
projected ──claim resolves schedule──► planned
planned ──outbox row created──► collection_scheduled
collection_scheduled ──runner picks row──► collecting
collecting ──PI succeeded──► funded
collecting ──PI processing (ACH)──► collecting (awaiting webhook)
collecting ──PI requires_action──► action_required ──on-session confirm──► funded
collecting|action_required ──definitive failure, retries exhausted──► funding_failed
funding_failed|collecting|action_required ──funding_due_at reached──► paused_unfunded   (job paused)
paused_unfunded ──succeeded (webhook/pay_now)──► funded                                  (job resumed)
funded ──period_end_on passed & pay lines settled──► closed
planned|collection_scheduled|collecting|funding_failed|paused_unfunded ──termination/finish/re-plan──► voided
```

Invariants:

- Only `Funding::PeriodStateService` writes `status`.
- `funded` requires a `job_payment_transactions` row with `status: succeeded`, `transaction_type: period_funding_charge`, `job_funding_period_id = period.id`, `amount_cents >= period.company_required_cents + trued_up_delta_cents` (or `company_required_cents == 0`).
- `voided` periods never receive collections; their pending outbox rows are `canceled`.
- A period can be `funded` once; a second succeeded charge for the same period is an anomaly → `PaymentRiskEvent` (`admin_adjustment` investigation), never silently absorbed.

## 4. `scheduled_funding_collections.status` (outbox)

```
pending ──run_at <= now, leased by runner──► leased
leased ──Stripe succeeded──► succeeded
leased ──Stripe processing──► awaiting_webhook ──webhook succeeded──► succeeded
                                            └──webhook failed──► failed
leased ──Stripe requires_action──► awaiting_action ──confirm ok──► succeeded
                                                 └──due reached──► failed
leased ──definitive failure, attempts < max──► failed  (+ new pending row with backoff run_at)
leased ──definitive failure, attempts == max──► exhausted
leased ──ambiguous error / timeout──► outcome_unknown ──reconciled──► succeeded|failed
leased ──lease_until passed, no outcome──► pending (re-leasable; same idempotency key within 23 h)
pending|failed|outcome_unknown ──period voided / flags off / admin cancel──► canceled
exhausted ──admin retry (audited)──► pending (new attempt suffix in key)
```

Idempotency key format: `tf_job_<job_id>_period_<sequence>_pfc_r<financial_revision>_<amount_cents>_a<attempt>`. `attempt` increments only on definitive failure; `outcome_unknown` retries reuse the key within 23 h and must reconcile via Stripe (`PaymentIntent.retrieve` by stored id, else `PaymentIntent.search` on `metadata['scheduled_funding_collection_id']`) before any new key is minted.

## 5. Work authorization (derived)

```
authorized?(date d) =
  job.status in {reserved, filled}
  ∧ job.funding_mode != rolling_two_week  →  true (legacy behaviour until converted)
  ∨ ( job.work_authorized_through_on.present?
      ∧ d <= job.work_authorized_through_on
      ∧ (job.paused_on.nil? ∨ d < job.paused_on) )
```

`work_authorized_through_on` moves forward only when a period becomes `funded`; it never moves backward (history is preserved; pause is expressed via `paused_on`).

## 6. Operational (`effective_status`)

```
existing: draft | pending_funding | open | claimed | active | completed | ended_early | expired
new:
  awaiting_funding : claimed ∧ scheduled_start_at <= now ∧ rolling_two_week ∧ work_authorized_through_on.nil?
  paused           : claimed ∧ paused_at.present?
precedence: ended_early > completed > paused > awaiting_funding > active > claimed > open
```

## 7. Pause / resume

```
active ──pause!(reason)──► paused        reasons: funding_not_received | ach_processing | payment_action_required | dispute_or_return | admin
paused ──resume!──► active               precondition: current period funded ∧ no blocking PaymentRiskEvent (unless admin override with audit)
paused ──terminate (company/admin)──► ended_early   (existing TerminateAssignmentService; settles worked hours)
paused ──finish──► completed              (only if company chooses to end; worked hours settle as today)
```

Effects on pause: `paused_at`, `paused_on`, `pause_reason` set; `status` unchanged; time entries dated `< paused_on` remain submittable/approvable; notifications to both parties; audit row. Effects on resume: fields cleared, `work_authorized_through_on` = funded period's `period_end_on`, audit row, notifications.

## 8. Posting → claim → start, end to end (rolling, normal posting)

```
draft
 └─publish (card ok)──► open · partially_funded · P1 funded · P2..n collection_scheduled · work_authorized_through_on = P1.end
     └─claim──► filled · (rolling start resolved → re-plan) · tech notified "authorized through <date>"
         └─start date──► active
             ├─P2 collected at due−lead──► funded · authorized_through = P2.end
             ├─P2 fails & due reached──► paused ──pay_now ok──► active
             ├─company terminates──► ended_early · future periods voided · unused funds refunded · worked hours settled
             └─last period ends → finish──► completed · settle! (true-up) · release_to_technician (unchanged gates)
```

## 9. Posting → claim → start (admin exemption)

```
draft ─publish (waived)─► open · unfunded · posted_under_funding_waiver · P1..n planned · NOT authorized
 └─claim at T
     ├─start > T+24h ──► outbox deferred_initial run_at=T+24h
     └─start ≤ T+24h ──► outbox deferred_initial run_at=T (+ inline attempt after commit)
         └─P1 funded──► partially_funded|funded · authorized_through = P1.end · P2..n scheduled
         └─P1 not funded by start──► awaiting_funding (no time entries) ──due passes──► paused(funding_not_received)
```
