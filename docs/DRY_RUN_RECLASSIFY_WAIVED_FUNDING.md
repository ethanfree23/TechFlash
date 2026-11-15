# Dry-run reconciliation plan — waived jobs mislabeled `funded`

**READ-ONLY.** `rake jobs:reclassify_waived_funding` never writes (`CONFIRM=1` is refused).  
**Do not run against production from this agent.** Owner may paste the rake output from a production console for approval.

## Shared selection (all required)

| Criterion | Rule |
|-----------|------|
| Job funding state | `funding_status = funded` |
| Pricing / required | Job is **priced**; ledger `company_required_cents > 0` (or missing snapshot) |
| Collection history | Succeeded company collections sum = **0** |
| Outstanding funding | Not a vacuous cash fully-funded case |
| Settlement | Reported; **never** proposed for change |

**Excluded:** unpriced zero-funding jobs (`!priced?` / `company_required_cents == 0`).

## Category A — verified waiver candidates

**Evidence:** `company.job_funding_waived = true` **or** `posted_under_funding_waiver` already true.

| Field | From | To |
|-------|------|-----|
| `funding_status` | `funded` | `unfunded` |
| `posted_under_funding_waiver` | usually `false` | `true` |
| `status` / `settlement_status` / `financial_revision` / JTXs | — | **unchanged** |

## Category B — inconsistent funded-without-cash (manual investigation)

**Evidence absent:** company not waived and marker not set.

- Report for investigation only.
- **Do not** propose `posted_under_funding_waiver=true`.
- Any correction requires **record-specific owner authorization**.

## Expected production Category A (HSI; re-verify with dry-run)

HSI CompanyProfile **8** / user **19** — each job separately:

| job_id | company | job_status | settlement | funding now → proposed | waiver → proposed | ledger evidence |
|--------|---------|------------|------------|------------------------|-------------------|-----------------|
| **32** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; company waived |
| **33** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| **34** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| **35** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| **36** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| **37** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |
| **38** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | same |

**Leave unchanged unless independent evidence supports a correction:**

| job_id | why leave |
|--------|-----------|
| **28** | succeeded company collections present |
| **29** | succeeded company collections present |
| **30** | succeeded company collections present |
| **31** | succeeded company collections present |

```bash
# Production console — READ-ONLY
bundle exec rake jobs:reclassify_waived_funding
```
