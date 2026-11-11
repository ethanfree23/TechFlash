# Dry-run reconciliation plan — waived jobs mislabeled `funded`

**READ-ONLY.** `rake jobs:reclassify_waived_funding` never writes (`CONFIRM=1` is refused).  
**Do not run against production from this agent.** Owner may paste the rake output from a production console for approval.

## Selection (ledger evidence)

- `funding_status = funded`
- company `job_funding_waived = true`
- succeeded company collections sum = 0
- skips unpriced vacuous fully-funded rows

## Proposed change (not applied)

| Field | From | To |
|-------|------|-----|
| `funding_status` | `funded` | `unfunded` |
| `posted_under_funding_waiver` | usually `false` | `true` |
| `status` | e.g. `open` | **unchanged** |
| `settlement_status` | e.g. `unsettled` | **unchanged** |
| Stripe / payment rows | — | **none invented** |

**Reason:** admin `job_funding_waived` publish path historically stamped `funded` without collections.

## Expected production candidates (investigation evidence; re-verify with dry-run)

HSI CompanyProfile **8** / user **19**:

| job_id | company | job_status | settlement | funding now → proposed | waiver → proposed | ledger evidence |
|--------|---------|------------|------------|------------------------|-------------------|-----------------|
| 32 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| 33 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| 34 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| 35 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| 36 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| 37 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| 38 | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |

**Leave unchanged:** jobs **28–31** (succeeded collections present).

```bash
# Production console — READ-ONLY
bundle exec rake jobs:reclassify_waived_funding
```
