# Payment Flow Testing Guide

Test **pay-to-post**, counteroffer deltas, actual-hours vs guaranteed settlement, membership Checkout, and Connect payouts. Use Stripe **test** keys only — no live money.

**Flow**: Company posts a priced job → saved card is charged → job is listed → technician claims (no second charge) → hours/settlement → payout when reviews or 72h pass **and** Connect is payout-ready.

## Fee structure

Rates come from **Admin membership tiers**, not a fixed 5%/5%. Example if the company snapshot is 10% and the technician snapshot is 20% on a $6,000 labor total:

| Party | Formula | Example |
|---|---|---|
| Company pays | labor + company commission | $6,600 |
| Tech receives | labor − technician commission | $4,800 |
| TechFlash | both commissions | $1,800 |

After funding, changing Admin percents must **not** change that job.

## Pay bases

- **Actual Hours Worked** (default): submit/approve time entries on the job. Settlement uses approved gross (OT/weekend included), then snapshot commissions. 80 estimated hours → 60 approved hours refunds the unused company funding.
- **Guaranteed Job Pay**: 80 posted hours vs 60 worked still settles at the guaranteed labor (e.g. $6,000), not time-entry hours.

## Prerequisites

1. Stripe test keys in `skilled_hub_api/.env` and frontend `VITE_STRIPE_PUBLISHABLE_KEY_TEST`
2. Company has a card in Settings **before posting** a priced job
3. Technician completed Connect onboarding until Settings shows **payout-ready** (not merely “connected”)
4. Test card: `4242 4242 4242 4242` — https://stripe.com/docs/testing#cards
5. 3DS test card if you need `pending_funding`: `4000 0025 0000 3155`

## Technician: Test Bank Account (Stripe Connect)

| Field | Test Value |
|---|---|
| Routing number | `110000000` |
| Account number | `000123456789` |
| SMS verification | `000-000` |

## Suggested scenarios

1. Post $75 × 8h × 10 days on Actual Hours. Confirm charge = labor + current company fee. Claim does not create a second PI.
2. Change the company tier commission in Admin. Funded job quote stays on the snapshot.
3. Accept a counter to $80 × 8 × 10. Only the **delta** is charged. Decline/fail collection → job stays unfilled.
4. Accept a lower counter. Only the delta is refunded.
5. Deny the technician: job reopens, funding remains.
6. Actual Hours: approve 60h of 80h estimate → company refund, tech paid from 60h after commission snapshot.
7. Guaranteed: approve 60h of 80h → still $6,000 labor.
8. Actual Hours over estimate without collecting the top-up → payout blocked.
9. Paid membership signup: account exists immediately on free/default; paid slug applies only after Checkout webhook.
10. Connect account id without `charges_enabled`/`payouts_enabled` → no transfer.

## Release

```bash
cd skilled_hub_api
bundle exec rails payments:release_eligible
bundle exec rails payments:diagnose
```

Or `POST /api/v1/internal/payments/release_eligible` with `X-Payments-Cron-Secret`.

Automated coverage lives in `skilled_hub_api/test/services/job_financial_flow_test.rb` (Stripe stubbed).
