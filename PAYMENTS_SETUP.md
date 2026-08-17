# Payment Setup Guide

This document describes TechFlash job funding, membership billing, Connect payouts, and how Admin pricing is applied.

## Profile & Settings

Both companies and technicians have a **Profile & Settings** page (`/settings`):

- **Company**: Add a credit/debit card. **Priced jobs are charged when posted** (pay-to-post), not when a technician claims.
- **Technician**: Connect a bank account with Stripe Connect Express. An account ID is not enough — payouts require charges enabled, payouts enabled, and an active transfers capability (`stripe_payout_ready`).
- **Billing history** (company): ledger of job charges, top-ups, and refunds from `GET /api/v1/billing_history`.

## Pricing source of truth

**Admin `MembershipTierConfig` is the master** for monthly/yearly fees, Stripe Price IDs, company platform fees, and technician commissions (including overrides and coupons).

There are **no hardcoded 5%/10%/20% rates** in runtime money math. Signup and Settings load live tier configs from the API.

When a job is funded, TechFlash **snapshots** commission percents and tier IDs onto the job. Later Admin edits do not change already-funded jobs.

- Company snapshot: at successful publish / funding
- Technician snapshot: at claim or accepted counteroffer that engages a tech
- Counteroffers that change rate/hours/days bump a financial revision and keep the **company** commission snapshot

`billing_exempt?` (`membership_fee_waived`) skips the **charge** on publish. It does not zero commissions unless an admin also sets a 0% override.

## Pay-to-post

1. Company prepares terms (rate, hours/day, days, pay basis).
2. Quote = labor + company commission snapshot (from current Admin pricing at snapshot time).
3. Off-session charge on the saved card.
4. Success → job `open` and `funding_status: funded`.
5. 3DS / `requires_action` → job stays `pending_funding` (not listed) until the company confirms.
6. Failure → unpublished (`pending_funding` / `funding_failed`).
7. `$0` or billing-exempt jobs publish with snapshots and no charge.

**Claim does not charge.** Claim at posted terms fills the job and snapshots technician commission. The job must already be funded (or exempt / zero-price).

**Deny technician:** reopen the job, **keep funding**, clear technician snapshots until a new tech is engaged.

**Unpublish** an unfilled funded job: refund net collected.

After funding, `hourly_rate_cents`, `hours_per_day`, `days`, and `pay_basis` are locked on PATCH. Change them only via counteroffer or settlement.

## Pay bases

| Value | Label | Settlement labor |
|---|---|---|
| `actual_hours_worked` (default, including existing jobs) | Actual Hours Worked | Sum of approved `TimeEntryPayLine.gross_pay_cents` (keeps OT/weekend), then apply **technician and company commission snapshots** |
| `guaranteed_job_pay` | Guaranteed Job Pay | Snapshotted `agreed_labor_cents`. Time entries are operational only |

Estimated hours/value must never be labeled guaranteed.

## Counteroffers

Accepting a counter that changes rate/hours/days:

1. Compute the new required company total from the **job company commission snapshot**.
2. Charge or refund **only the delta**.
3. If collection fails or needs 3DS, **do not fill** the job.

## Payouts

Transfer to the technician only if:

- Release rules: both reviews **or** 72 hours since finish
- Ledger fully funded (`amount_due == 0`)
- Technician Connect is **payout-ready**
- No successful `technician_transfer` already exists

Payout amount uses snapshot technician commission (not raw gross pay).

## Membership signup

1. Free/default tiers: account is created and granted immediately (no Stripe).
2. Paid tiers: create the user first on the **free/default** slug with `pending_membership_level`. Then Stripe Checkout **Subscription** (Customer + recurring Price ID).
3. Paid access is granted only when `checkout.session.completed` / subscription webhooks succeed.
4. Abandoned Checkout leaves a free account; Settings upgrade still works.

Company job cards still use SetupIntent in Settings. Membership does **not** use a one-time guest PaymentIntent.

## Ledger

- `payments`: one header row per priced job (`transfer_group`: `TECHFLASH_JOB_<id>`).
- `job_payment_transactions`: append-only charges, refunds, and transfers.
- Idempotency keys: `tf_job_<job_id>_txn_<type>_r<rev>_<amount>`.

## Backend setup

```bash
cd skilled_hub_api
bundle install
bundle exec rails db:migrate
```

**Production:** `STRIPE_SECRET_KEY=sk_live_...`

**Local/dev:** `STRIPE_SECRET_KEY_TEST=sk_test_...` (preferred so live keys are never loaded in development).

**Required in production/staging:** `STRIPE_WEBHOOK_SECRET`. Missing/invalid secret returns **500** and does not process events. Dev/demo logs a skip instead of pretending health.

**Cron secret (optional HTTP trigger):** `PAYMENTS_CRON_SECRET` for `POST /api/v1/internal/payments/release_eligible` with header `X-Payments-Cron-Secret`.

### Stripe Connect

Technicians complete Express onboarding from Settings. Readiness is stored on `technician_profiles` (`stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_transfers_capability_status`, …) and synced from `account.updated` webhooks.

### Payment release

```bash
bundle exec rails payments:release_eligible
```

This is **not** scheduled in-repo (`skilled_hub_api/railway.json` has no cron). Configure Railway Cron (or equivalent) in the dashboard. See `CRON_JOBS.md`.

## Webhook events to enable

In the Stripe Dashboard endpoint for `/api/v1/stripe/webhook`:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `account.updated`

## Admin tiers

Destroying a tier that is assigned or referenced by job snapshots **archives** it (`active: false`) instead of deleting history. Public/signup listings already hide inactive tiers. Transfer assignments first if you want to move live users off a slug.
