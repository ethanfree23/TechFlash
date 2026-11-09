# Staging Environment Setup (Stripe TEST mode)

Staging is **production-like Rails** with **real Stripe TEST API calls**.  
`DemoMode` is disabled. Outbound email/SMS/Checkr/GHL are sandboxed by default.

## Exact environment variable names

### Railway staging backend (`RAILS_ENV=staging`)

| Variable | Required | Notes |
|---|---|---|
| `RAILS_ENV` | Yes | `staging` |
| `DATABASE_URL` | Yes | Dedicated staging Postgres only — never production |
| `SECRET_KEY_BASE` / `RAILS_MASTER_KEY` | Yes | Separate from production |
| `STRIPE_SECRET_KEY` | Yes | Must be `sk_test_...` (live keys rejected) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Staging platform destination signing secret |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Recommended | Staging Connect destination |
| `APP_HOST` | Recommended | Staging API hostname (no `https://`) |
| `STAGING_HOSTS` | Optional | Comma-separated extra allowed hosts |
| `STAGING_SANDBOX` | Optional | Defaults on when `RAILS_ENV=staging` |
| `STAGING_ALLOW_MAIL_DELIVERY` | Optional | `true` only for Mailtrap sink inbox |
| `STAGING_ALLOW_REAL_WORLD_COMMS` | Optional | Keep unset/false |
| `DEMO_MODE` | Must be unset/false | Staging refuses DemoMode |
| `ALLOW_DEMO_RESET` | Must be unset/false | |
| `CHECKR_*` | Optional | Staging sandbox simulates Checkr invitations |
| `TWILIO_*` / `GHL_*` | Optional | Sandboxed; not sent |
| `CORS` / frontend origins | As needed | Allow staging Vercel origin |

### Vercel staging / PR preview frontend

| Variable | Exact name | Notes |
|---|---|---|
| API base URL | `VITE_API_BASE_URL` | Must point at staging Railway `/api/v1` |
| Stripe publishable key | `VITE_STRIPE_PUBLISHABLE_KEY_TEST` (preferred) or `VITE_STRIPE_PUBLISHABLE_KEY` | Must be `pk_test_...` |
| Demo API | `VITE_DEMO_API_BASE_URL` | Leave pointing at demo; do not use for staging ACH |

Read in code:
- `skilled-hub-frontend/src/api/apiConfig.js` → `VITE_API_BASE_URL`
- `skilled-hub-frontend/src/stripeConfig.js` → `VITE_STRIPE_PUBLISHABLE_KEY_TEST` / `VITE_STRIPE_PUBLISHABLE_KEY`

## Railway steps

1. In Railway project **Tech Flash**, create environment **staging**.
2. Create a new backend service from this repo (branch with Stage 2).
3. Create a dedicated PostgreSQL service for staging.
4. Connect `DATABASE_URL` from that Postgres only.
5. Set `RAILS_ENV=staging`.
6. Set separate `SECRET_KEY_BASE` / master key.
7. Set `STRIPE_SECRET_KEY=sk_test_...`.
8. Keep outbound sandbox defaults (do not set `STAGING_ALLOW_REAL_WORLD_COMMS`).
9. Assign a staging Railway domain / custom host; set `APP_HOST`.
10. Deploy; confirm `db:prepare` runs against staging DB only (`bin/docker-entrypoint`).
11. Verify boot logs: `RAILS_ENV=staging DemoMode=false StripeMode=test`.
12. Verify `/api/v1/meta` shows the expected git SHA.

## Vercel steps

1. Create a dedicated staging project **or** configure PR #29 preview env vars.
2. Set `VITE_API_BASE_URL=https://<staging-railway-host>/api/v1`.
3. Set `VITE_STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...` (never `pk_live_`).
4. Rebuild frontend.
5. In browser network tab: confirm API calls hit staging only.
6. Confirm login/session/CORS work against staging.
7. Confirm Stripe.js loads with test publishable key.

## Stripe Dashboard (TEST mode)

1. Stay in **Test mode**.
2. Create platform webhook endpoint → `https://<staging-api>/api/v1/stripe/webhook`.
3. Subscribe events listed in `docs/STRIPE_WEBHOOK_EVENT_INVENTORY.md` (platform list).
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`.
5. Create Connect webhook destination for connected accounts; subscribe Connect list.
6. Copy Connect signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
7. Send Stripe CLI/Dashboard test events; confirm `stripe_webhook_events` rows and `processed_at`.

## ACH SetupIntent note

Server creates SetupIntent **without** `mandate_data`.  
Frontend collects mandate via `collectBankAccountForSetup` + `confirmUsBankAccountSetup`.

## Coordinator E2E checklist

See `docs/STAGING_E2E_CHECKLIST.md`.
