# Payment Flow Testing Guide

This guide walks you through testing the full payment flow: **charge company (price + 5%)** when a tech claims a job, and **transfer to tech (price - 5%)** when the job is complete and release conditions are met.

**Flow**: Tech claims job → company is charged immediately (no acceptance step). Company can optionally deny the tech (refunds and reopens the job).

## Fee Structure

| Party | Amount | Example ($100 job) |
|-------|--------|--------------------|
| **Company pays** | Job price + 5% | $105.00 |
| **Tech receives** | Job price - 5% | $95.00 |
| **SkilledHub revenue** | 10% total (5% from each side) | $10.00 |

## Prerequisites

1. **Stripe keys** configured in `skilled_hub_api/.env` and `skilled-hub-frontend/.env`
2. **Company** must add a card in Settings **before** a tech can claim a paid job
3. **Technician** has connected a Stripe Connect bank account in Settings (see test bank details below)
4. **Test cards** (company payments): `4242 4242 4242 4242` — https://stripe.com/docs/testing#cards
5. **Test bank** (technician payouts): see "Technician: Test Bank Account" below

---

## Technician: Test Bank Account (Stripe Connect)

When a technician clicks "Connect Bank Account" in Settings, they go through Stripe Connect Express onboarding. Use these **test values** (test mode only):

| Field | Test Value |
|-------|------------|
| **Routing number** | `110000000` |
| **Account number** | `000123456789` |
| **SMS verification** (if prompted) | `000-000` |

These simulate a US bank account. In test mode, payouts are simulated—no real money moves. The transfer appears in the Stripe Dashboard under **Connect → Accounts** and **Transfers**.

> **Note:** Use your **test** Stripe keys (`sk_test_...`, `pk_test_...`). Test bank numbers only work with test API keys.

---

## Test 1: Charge Company (Price + 5%) on Claim

### Steps

1. **Create a company account** and log in
2. **Add a card** in Profile & Settings → Payment → Add Card (required for paid jobs)
3. **Create a job** with a price:
   - Set hourly rate, hours, days (e.g. $50/hr × 8 hrs × 1 day = $400)
   - Or use `price_cents` for legacy jobs
   - Job amount = $400 → Company will be charged **$420** (400 × 1.05) when tech claims
4. **Create a technician account** (different browser/incognito) and log in
5. **Technician: Connect bank** in Profile & Settings → Connect Bank Account (use test bank details below)
6. **Technician: Claim the job** (browse jobs → click "Claim Job")

### Expected

- Claim succeeds
- Company's card is charged **$420.00** automatically (price + 5%)
- Job status → filled (tech has the job)
- In Stripe Dashboard → Payments: charge of $420.00
- Funds are held on the platform (escrow)

### If claim fails

- "Company must add a payment method in Settings before technicians can claim this job" → Company needs to add a card first

---

## Test 2: Transfer to Tech (Price - 5%)

### Release conditions (either one)

- **Both parties have reviewed each other**, OR
- **72 hours (3 days)** have passed since the job was marked finished

### Option A: Both parties review

1. **Mark job complete**: Company or technician clicks "Mark Complete" on the job
2. **Company leaves a review** for the technician
3. **Technician leaves a review** for the company
4. **Immediate release**: Funds transfer to the technician's Stripe Connect account

### Option B: 72-hour timeout

1. **Mark job complete**
2. **Wait 72 hours** (or simulate in Rails console – see below)
3. **Run the release task**:
   ```bash
   cd skilled_hub_api
   bundle exec rails payments:release_eligible
   ```

### Simulating 72 hours (for quick testing)

```bash
cd skilled_hub_api
bundle exec rails console
```

```ruby
# Find the finished job
job = Job.find(YOUR_JOB_ID)

# Set finished_at to 73 hours ago
job.update!(finished_at: 73.hours.ago)

# Run release
PaymentService.release_if_eligible(job)
# => {:success=>true, :payment=>#<Payment ...>}
```

### Expected

- Payment status → `released`
- In Stripe Dashboard → **Transfers**: transfer of $380.00 (for $400 job) to the technician's connected account
- Technician's connected account balance increases (test mode: simulated, no real bank transfer)

### Verify technician payout

1. **Stripe Dashboard** → **Connect** → **Accounts** → select the technician's account
2. **Balance** tab: shows the transferred amount
3. **Transfers** (https://dashboard.stripe.com/test/transfers): platform → connected account

---

## Verify in Stripe Dashboard

1. **Payments** (https://dashboard.stripe.com/test/payments): Company charge = price + 5%
2. **Transfers** (https://dashboard.stripe.com/test/transfers): Transfer to connected account = price - 5%
3. **Connect** → **Accounts**: Technician's Express account shows the transfer

---

## Troubleshooting

| Issue | Check |
|-------|------|
| "Company has no payment method" | Add card in Settings → Payment |
| "Technician has no Stripe account" | Connect bank in Settings (technician) with test routing `110000000`, account `000123456789` |
| Payment fails | Use valid Stripe test card (4242 4242 4242 4242) |
| Transfer fails | Technician must complete Stripe Connect onboarding; use test bank numbers above |
| "Must use test bank account" | Ensure you're using test API keys and test bank (110000000 / 000123456789) |
| Release doesn't run | Call `PaymentService.release_if_eligible(job)` or run `rails payments:release_eligible` |

---

## Cron for Production

To automatically release payments after 72 hours, add to crontab:

```
0 * * * * cd /path/to/skilled_hub_api && bundle exec rails payments:release_eligible
```

This runs every hour and releases any eligible held payments.
