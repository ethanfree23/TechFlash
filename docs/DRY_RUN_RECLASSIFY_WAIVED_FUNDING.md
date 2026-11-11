# Dry-run correction plan — waived jobs mislabeled `funded`

**Status:** Plan only. **Do not run against production** until owner approval.  
**Code:** `bundle exec rake jobs:reclassify_waived_funding` (default dry-run; `CONFIRM=1` writes).

## Selection (ledger evidence, not blanket status)

- `jobs.funding_status = funded`
- `company_profiles.job_funding_waived = true`
- `sum(succeeded company collection JobPaymentTransaction.amount_cents) = 0`
- Skips unpriced vacuous fully-funded rows when ledger proves required = 0

## Action (per candidate)

| Field | From | To |
|-------|------|-----|
| `funding_status` | `funded` | `unfunded` |
| `posted_under_funding_waiver` | `false` (typical) | `true` |
| `status` (e.g. `open`) | unchanged | unchanged |
| Payment / Stripe rows | none invented | none invented |

## Expected production candidates (from read-only investigation @ main `6b47c18` / still valid after Stripe hotfix)

HSI CompanyProfile **8** / user **19**, `job_funding_waived`, no `stripe_customer_id`, zero `JobPaymentTransaction` rows:

| job_id | status (expected) | funding_status now | after dry-run apply | waiver marker after | notes |
|--------|-------------------|--------------------|---------------------|---------------------|-------|
| 32 | open | funded | unfunded | true | labor 1040000¢; settlement unsettled |
| 33 | open | funded | unfunded | true | same |
| 34 | open | funded | unfunded | true | same |
| 35 | open | funded | unfunded | true | same |
| 36 | open | funded | unfunded | true | same |
| 37 | open | funded | unfunded | true | same |
| 38 | open | funded | unfunded | true | same |

**Leave unchanged:** jobs **28–31** (have real `JobPaymentTransaction` / succeeded collections).

Re-verify with dry-run on a production console **read-only** before any `CONFIRM=1`:

```bash
# On API host — DRY-RUN only (no CONFIRM)
bundle exec rake jobs:reclassify_waived_funding AUDIT_LOG=/tmp/reclassify_waived_dryrun.log
```

Owner must compare printed `job_id=… funding: funded -> unfunded` lines to the table above, then approve a separate change window for `CONFIRM=1`.

## Risks if applied incorrectly

- Relabeling a job that has succeeded collections would be wrong — rake skips when collected > 0.
- Claiming still works via `posted_under_funding_waiver` / company waiver; payouts remain ledger-gated (`fully_funded`, `net_funded`, `no_succeeded_collections`).
