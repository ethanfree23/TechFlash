# Payout-safety investigation (production `main` @ `6b47c18`)

**Scope:** Read-only analysis and proposal. No production data changes. No merge. ACH remains off. Draft PR branch OK for the written plan only.

**Owner context:** HSI (CompanyProfile 8 / user 19) was explicitly authorized to post jobs without funding (`job_funding_waived`).

---

## Executive verdict

1. **Root cause of `funding_status = funded` with zero collections** is the **admin job-funding waiver path**, not a migration/backfill and not seed/demo. On publish/adjust for a waived company, the app intentionally opens the job and stamps `funding_status: :funded` without creating any `JobPaymentTransaction`.
2. **Technician Stripe transfers cannot be created today for those HSI jobs (or any job with zero succeeded collections).** Payout creation does **not** trust `funding_status`. It gates on `JobLedger.fully_funded` (succeeded collections − refunds ≥ company required), payout ≤ net funded, and source-charge allocation that **blocks when there are no succeeded collections**.
3. **Semantic bug:** `funded` is overloaded to mean both “posting allowed / treat as publishable” and “cash collected.” Waiver posting is intended; calling that state `funded` is not.
4. **Data correction (plan only):** Reclassify waived-without-collections jobs (notably HSI 32–38) away from `funded` once a distinct status/flag exists; do not invent collections; do not touch jobs 28–31 that have real ledger rows.

---

## Q1 — Which code path set `funding_status = funded` for jobs 32–38?

### Production facts (given)

- Jobs 32–38: HSI, labor `1_040_000` cents, company_required `1_144_000`, `funding_status = funded`, settlement unsettled, **zero** `JobPaymentTransaction` rows, **one** `job_financial_revisions` row each with `source: posting`, created **2026-11-03**, `technician_payout_cents: 0`.
- HSI: no `stripe_customer_id`; waiver authorized.
- Only jobs 28–31 have payment transactions in prod (4 rows total).

### Exact code paths that stamp `:funded` without collecting

**Primary (intended waiver publish) — `JobFundingService.fund_for_publish!`:**

```79:82:skilled_hub_api/app/services/job_funding_service.rb
    if !job.priced? || job.job_funding_waived?
      job.update!(status: :open, funding_status: :funded, go_live_at: Time.current)
      record_revision!(job, source: "posting")
      return { success: true, job: job, waived: job.job_funding_waived? }
```

**Create/update publish bypass when `needs_funding` is false** (priced + waived, or unpriced) — `JobsController` create:

```197:236:skilled_hub_api/app/controllers/api/v1/jobs_controller.rb
        needs_funding = job.priced? && !job.job_funding_waived?
        job.status = needs_funding ? :pending_funding : :open
        ...
        else
          JobFundingService.snapshot_company!(job)
          job.update!(funding_status: :funded)
          JobFundingService.record_revision!(job, source: "posting")
        end
```

Same pattern in `finalize_publish_funding!`:

```797:800:skilled_hub_api/app/controllers/api/v1/jobs_controller.rb
        JobFundingService.snapshot_company!(job)
        job.update!(funding_status: :funded) unless job.funding_funded?
        JobFundingService.record_revision!(job, source: "posting")
```

**Counter-offer / schedule adjustment while waived** — `JobFundingAdjustmentService.reconcile!`:

```28:31:skilled_hub_api/app/services/job_funding_adjustment_service.rb
    if job.job_funding_waived?
      job.update!(funding_status: :funded)
      JobFundingService.record_revision!(job, source: source)
      return { success: true, job: job, waived: true }
```

(`technician_payout_cents: 0` on the posting revision matches `record_revision!` when technician commission snapshot is still nil at post time — expected for open, unclaimed jobs.)

### Ruled out for jobs 32–38

| Candidate | Why not |
|-----------|---------|
| Real Stripe collection → `publish!` / webhook | Would create succeeded collection txn; HSI has none; no customer id |
| Migration `20260814000001_add_job_financial_ledger` backfill | Sets `funded` for legacy jobs with held/released payment **or** `labor <= 0` **or** then-`MembershipPolicy.billing_exempt?`. Jobs 32–38 were created **2026-11-03** with posting revisions after waiver column `20260820190000_add_job_funding_waived_to_company_profiles`; they are not that backfill |
| Demo/seed | Production HSI open jobs with posting revision match live waiver publish, not seeder |

### Intended semantics?

- **Posting without payment for waived companies:** **Yes — intentional** and owner-authorized (`company_profiles.job_funding_waived`).
- **Labeling that state `funding_status: funded`:** **Misleading / unintended as cash semantics.** Downstream claim checks treat `funding_funded?` as “ok to claim” (`Jobs::ClaimJobService`), which is correct for waiver UX, but operators reading “funded” will assume Stripe money is held. Ledger and payout code already know better; the enum name does not.

Other writers of `:funded` (for completeness): successful collect/`publish!`, adjustment after real collect/refund balance, settlement when ledger fully funded, webhook confirm. Those paths imply real money except the waiver branches above.

---

## Q2 — Can a technician transfer be created without verified collections?

### Short answer

**No — not through production transfer-creating code on `6b47c18`.**  
`funding_status` alone **cannot** authorize a payout. Transfers go through `PaymentService.release_to_technician` → `JobStripeOps.transfer!`. Guards use the ledger (succeeded collection amounts), not the enum.

### How “verified collections” are defined today

`JobLedger#summary_for_labor`:

- `collected` = sum of **succeeded** `COLLECTION_TYPES`
- `refunded` = sum of **succeeded** `REFUND_TYPES`
- `net_funded_cents = collected - refunded`
- `amount_due_cents = max(company_required - net, 0)`
- `fully_funded = amount_due.zero?`

```49:72:skilled_hub_api/app/services/job_ledger.rb
    collected = sum_types(JobPaymentTransaction::COLLECTION_TYPES)
    refunded = sum_types(JobPaymentTransaction::REFUND_TYPES)
    net = collected - refunded
    ...
      fully_funded: due.zero?,
```

```133:135:skilled_hub_api/app/services/job_ledger.rb
  def sum_types(types)
    rel = @job.job_payment_transactions.status_succeeded.where(transaction_type: types)
```

For HSI 32–38 with labor/required positive and **zero** txns: `fully_funded == false`.

### Every transfer-creating path and its guards

| Path | Creates Stripe Transfer? | Guards |
|------|--------------------------|--------|
| **`PaymentService.release_to_technician`** | **Yes — sole production creator** via `JobStripeOps.transfer!` | Missing tech commission snapshot → refuse; **`ledger.fully_funded`** else “underfunded”; processing company collections → refuse; pending/processing refunds → refuse; disputed succeeded collections → refuse; open `PaymentRiskEvent` → refuse; existing succeeded transfer / transferred_cents → idempotent or refuse; accepted tech + Connect payout-ready; **`payout_amount > 0`**; **`payout_amount <= net_funded_cents`**; outcome_unknown conflict; **`persist_source_allocation!` / `source_transaction_decision`** — **blocks if `collections.empty?` (`no_succeeded_collections`)**, missing charge ids, insufficient allocatable, etc.; admin auth consume only for post-window outcome_unknown retry (does **not** skip funding guards) |
| **`JobSettlementService.settle!`** | No transfer | Collects due / refunds surplus; then **`unless ledger.fully_funded` → settlement_blocked**; only then sets `settlement_status: settled` + `funding_status: funded` |
| **`JobSettlementService.settle_and_release_if_eligible!`** | Calls `release_to_technician` only after successful settle + release eligibility (72h or mutual ratings) + payable amount | Inherits settle + release gates; needs a `Payment` header row (`job.payments.first`) — waived HSI jobs with **no** payment header also cannot release even if someone bypassed ledger |
| Callers of settle+release: `PaymentService` settle wrapper, jobs/ratings controllers, terminate assignment, auto-complete expired, `payments_release_runner` / internal release-eligible | Same | Same |
| **Admin `reconcile_transfer` / Risk A recovery** | Reconciles or authorizes **retry of an existing** transfer txn; create still goes through `release_to_technician` | Does not invent a transfer without the release guards; cannot mint money for jobs with no transfer txn (HSI 32–38 have none) |
| **`JobStripeOps.transfer!`** | Low-level Stripe call | Not called from other app services for payouts; staging E2E / tests only besides `PaymentService` |

Critical allocation hard-stop (independent of `funding_status`):

```853:856:skilled_hub_api/app/services/payment_service.rb
    collections = job.job_payment_transactions.company_collections.status_succeeded.order(:id).to_a
    if collections.empty?
      return blocked_decision("no_succeeded_collections")
```

Release underfunded gate (also independent of enum):

```94:96:skilled_hub_api/app/services/payment_service.rb
      unless ledger.fully_funded
        early = { error: "Job is underfunded; technician payout is blocked." }
```

Settlement underfunded gate:

```130:132:skilled_hub_api/app/services/job_settlement_service.rb
    unless ledger.fully_funded
      job.update!(settlement_status: :settlement_blocked, funding_status: :adjustment_required)
      return { success: false, error: "Job is underfunded and cannot be settled." }
```

### Edge cases (still no unpaid transfer)

- **Labor settles to $0** → `fully_funded` can be true with zero collections (`due == 0`), but `technician_net_payout_cents <= 0` → no transfer; allocation would still block non-positive / empty collections for a positive payout.
- **Waiver finish with positive labor** → settle tries `collect!`; HSI has no customer → collect fails → blocked; even if collect were skipped, `fully_funded` remains false until succeeded collections cover required.
- **`platform_balance` multi-charge mode** still requires succeeded collections with charge IDs and allocatable ≥ payout — never “empty ledger → balance transfer.”

### Risk assessment: can money move **today** without collections?

**For HSI jobs 32–38 and any job with zero succeeded collections: No.**  
Operator confusion risk is **high** (UI/admin “funded” looks cash-backed). Stripe Connect outflow risk from this bug class is **low under current code**, provided ACH stays off and no one manually creates Stripe Transfers outside the app.

Residual (non-transfer) risks: waived jobs are claimable and can run to completion; settlement will demand real collection later — ops surprise, not silent payout.

---

## Q3 — Fix proposal: separate “posting allowed without payment” from “funded”

### Goals

1. Payouts require verified collected funds:  
   `sum(succeeded collections) − sum(succeeded refunds) ≥ technician payout` (and company required for settlement), **unchanged / hardened**.
2. Exempt posting must **not** look like cash-funded.
3. Claim/publish UX for waived companies must keep working.

### Recommended model

**A. New funding status (preferred)** — e.g. `funding_waived` / `posted_unfunded` (integer enum value 4):

- Waiver publish + waived adjustment → set **`funding_waived`**, never `:funded`.
- `:funded` only after ledger fully covered by succeeded collections (and keep settlement’s funded stamp only when `fully_funded`).
- Claim rule: allow if `funding_funded? || funding_waived? || !priced?` (replace “funded OR waived company flag” dual read with job-level status).
- Serializers/admin: show “Posted under funding exemption — no company payment collected.”

**B. Keep enum + add boolean `posted_under_funding_waiver`** (weaker): still leave historical `funded` confusing unless backfilled.

**C. Harden payout assertion (do regardless of A/B):**

In `release_to_technician`, after ledger checks, assert explicitly:

```ruby
raise/return error unless ledger.net_funded_cents >= payout_amount
# already present as payout_amount > net_funded_cents
# ADD: refuse if funding_status is waived/unfunded-class even if due==0 with positive payout (belt)
# ADD: refuse if company_required > 0 && collected.zero?
```

Keep `source_transaction_decision` empty-collections block as non-negotiable.

**D. Stop setting `:funded` in waiver branches** of:

- `JobFundingService.fund_for_publish!`
- `JobsController` create / `finalize_publish_funding!`
- `JobFundingAdjustmentService.reconcile!` waived branch

**E. Do not treat `job_funding_waived?` as settlement/payout exemption** (today settle does not; keep it that way — comment + test).

---

## Q4 — Production data correction plan (reviewed, **not executed**)

### Inventory (expected; re-verify with read-only SQL before any write)

1. **HSI jobs 32–38** (and any other open/finished jobs where `funding_status = funded` AND net succeeded collections = 0 AND company is `job_funding_waived`):
   - **From:** `funding_status = funded`, settlement unsettled, zero payment txns.
   - **To (after code deploy of new enum):** `funding_status = funding_waived` (or agreed name).  
   - **Do not:** invent `JobPaymentTransaction` rows, Stripe PIs, or mark settlement settled.
2. **Jobs 28–31** (have real `JobPaymentTransaction` rows): **leave alone** unless ledger audit shows mismatch.
3. **Other of 16/18 “funded” jobs:** classify each:
   - Succeeded collections ≥ company_required → keep `funded`.
   - Waived + zero collections → same as (1).
   - Unpriced / $0 labor edge → document separately; may be legitimately “fully funded” at $0.
4. **`job_financial_revisions`:** keep historical `source: posting` rows; optional note in admin UI. Do not rewrite amounts unless a later audit requires it.
5. **Execution order (when owner approves a future change window):**
   1. Deploy code that understands new status + stops writing `:funded` on waiver.
  2. Read-only CSV of candidates (`job_id`, company, funding_status, net_funded, waived flag).
   3. Reviewed UPDATE for candidates only.
   4. Re-run payout dry-check: `JobLedger.for(job).fully_funded` false for positive-required zero-collection jobs; attempt release in staging clone → underfunded / no_succeeded_collections.

**No production writes in this investigation.**

---

## Tests to add

1. **Waiver publish does not imply cash:** company `job_funding_waived` → create/publish → job open, **status ≠ cash-funded** (new enum), **zero** payment txns, revision `source: posting`.
2. **Release blocked with funded-looking waived job (regression on current bug shape):** job `funding_status: funded`, labor/required positive, no collections → `release_to_technician` errors underfunded **and/or** allocation `no_succeeded_collections`; **no** Stripe transfer stub call.
3. **Settlement blocked same fixture** → `settle!` fails underfunded / collect failure; settlement not `settled`.
4. **Happy path unchanged:** succeeded initial charge covering required → settle → release creates transfer once.
5. **Claim still allowed** under waiver status without collections.
6. **Adjustment reconcile waived** sets waiver status, not `:funded`.
7. **Empty collections + forced `fully_funded` simulation** (if test injects required=0 and positive payout) still blocked by allocation / payout ≤ net.

---

## Summary table

| Question | Answer |
|----------|--------|
| Who set funded on 32–38? | Waiver publish path (`fund_for_publish!` and/or JobsController non-funding branch); intended posting exemption; **bad label** |
| Migration/seed? | **No** for these rows |
| Can payout run without collections today? | **No** (ledger + allocation + payout≤net) |
| Does funding_status alone authorize payout? | **No** |
| Fix | New status for exemption; `:funded` only with verified collections; keep/harden release guards |
| Data | Reclassify waived zero-collection “funded” jobs after deploy; leave real ledger jobs; **plan only** |
