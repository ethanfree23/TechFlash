# Payment Setup Guide

This document describes how to configure and use the payment system for Skilled Hub.

## Profile & Settings

Both companies and technicians have a **Profile & Settings** page (`/settings`) where they can:

- **Profile**: Bio, photo (avatar), company name/industry/location (company), trade type/experience/availability (technician)
- **Payment**:
  - **Company**: Add credit/debit card to pay for jobs when accepting technicians
  - **Technician**: Connect bank account (Stripe Connect) to receive payouts

Access via the "Profile & Settings" link in the nav, or by clicking your avatar in the dashboard header.

## Overview

- **Job posting**: Companies set a price (USD) when creating or editing a job.
- **Fees**: Company pays **price + 5%**; technician receives **price - 5%**; SkilledHub earns 10% total.
- **When job is accepted**: Company pays via Stripe. Funds are held in escrow.
- **Release conditions**: Money is released to the technician when:
  1. Both parties have left a review, **OR**
  2. 72 hours (3 days) have passed since the job was marked complete.

## Backend Setup

### 1. Run migrations

```bash
cd skilled_hub_api
bundle install
bundle exec rails db:migrate
```

### 2. Configure Stripe credentials

**Option A: Use .env (easiest for development)**

Edit `skilled_hub_api/.env` and replace the placeholder with your secret key:

```
STRIPE_SECRET_KEY=sk_test_your_actual_key_here
```

Get your keys at https://dashboard.stripe.com/test/apikeys

**Option B: Rails credentials**

```bash
EDITOR=code bundle exec rails credentials:edit
```

Add under the `stripe` key:

```yaml
stripe:
  secret_key: sk_test_xxxxx
```

### 3. Stripe Connect (for technician payouts)

Technicians need a Stripe Connect account to receive payouts. Set `stripe_account_id` on their `TechnicianProfile` (e.g. `acct_xxxxx`). You can:

- Use [Stripe Connect Express](https://stripe.com/docs/connect/express-accounts) onboarding flow
- Manually set via Rails console: `TechnicianProfile.find(id).update(stripe_account_id: 'acct_xxx')`

### 4. Cron job for 72-hour release

Run this task periodically (e.g. every hour) to release payments when 72 hours have passed:

```bash
bundle exec rails payments:release_eligible
```

Or add to crontab:

```
0 * * * * cd /path/to/skilled_hub_api && bundle exec rails payments:release_eligible
```

## Frontend Setup

### 1. Stripe publishable key

Edit `skilled-hub-frontend/.env` and replace the placeholder with your publishable key:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
```

Get your keys at https://dashboard.stripe.com/test/apikeys

### 2. Install dependencies

```bash
cd skilled-hub-frontend
npm install
```

## Flow Summary

1. **Create job** → Company adds price (optional; leave blank for unpaid jobs). Company must add a card in Settings before posting paid jobs.
2. **Technician claims** → Job is theirs immediately. If job has price: company's card is charged (price + 5%) and funds are held.
3. **Company can deny** (optional) → Refunds payment and reopens the job.
4. **Mark complete** → Company or technician marks job finished.
5. **Release** → When both have reviewed OR 72h passed → funds transfer to technician's Stripe account.

## API Endpoints

- `PATCH /api/v1/jobs/:id/claim` – Technician claims job. Charges company's card if job has price.
- `PATCH /api/v1/jobs/:id/deny` – Company denies claimed technician (refunds and reopens job).
