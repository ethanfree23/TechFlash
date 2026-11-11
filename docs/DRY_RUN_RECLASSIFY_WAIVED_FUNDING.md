# Dry-run reconciliation plan — waived jobs mislabeled `funded`

**READ-ONLY.** `rake jobs:reclassify_waived_funding` never writes (`CONFIRM=1` is refused).  
**Do not run against production from this agent.** Owner may paste the rake output from a production console for approval.

## Candidate selection (all required)

| Criterion | Rule |
|-----------|------|
| Job funding state | `funding_status = funded` |
| Pricing / required | Job is **priced**; ledger `company_required_cents > 0` (or missing snapshot) |
| Collection history | Succeeded company collections sum = **0** |
| Outstanding funding | Not a vacuous fully-funded cash case (`fully_funded && net > 0` skipped) |
| Settlement | Reported; **never** proposed for change |
| Company waiver | **Corroborating evidence only** (reason text); not a hard gate |

**Excluded:** unpriced zero-funding jobs (`!priced?` / `company_required_cents == 0`) that legitimately use vacuous `:funded`.

## Proposed change (not applied)

| Field | From | To |
|-------|------|-----|
| `funding_status` | `funded` | `unfunded` |
| `posted_under_funding_waiver` | usually `false` | `true` |
| `status` | e.g. `open` | **unchanged** |
| `settlement_status` | e.g. `unsettled` | **unchanged** |
| `financial_revision` | any | **unchanged** |
| Stripe / payment / JTX rows | — | **none invented / none mutated** |

## Expected production candidates (investigation evidence; re-verify with dry-run)

HSI CompanyProfile **8** / user **19** — report each job separately:

| job_id | company | job_status | settlement | funding now → proposed | waiver → proposed | ledger evidence |
|--------|---------|------------|------------|------------------------|-------------------|-----------------|
| **32** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **33** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **34** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **35** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **36** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **37** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |
| **38** | 8 (HSI) | open | unsettled | funded → unfunded | false → true | collected 0; required ~1144000¢; not fully_funded; 0 JTXs |

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
