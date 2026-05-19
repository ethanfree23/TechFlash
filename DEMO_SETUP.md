# Demo environment — TechFlash

Isolated demo stack for in-person company and investor presentations. **Never** point demo reset tasks or `DATABASE_URL` at production.

## Architecture

| Layer | Production | Demo |
|-------|------------|------|
| Frontend | `techflash.app` (Vercel) | `demo.techflash.app` (Vercel, `build:demo`) |
| API | Railway `RAILS_ENV=production` | Railway `RAILS_ENV=demo` |
| Database | Production Postgres | **Separate** demo Postgres |

Production admin shows a **Demo Environment** card (link + credentials only). Demo admin can **Reset Demo Data** and run the guided walkthrough.

---

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `demo.admin@techflash.app` | `DemoPassword123!` |
| Company | `demo.company@techflash.app` | `DemoPassword123!` |
| Technician | `demo.tech@techflash.app` | `DemoPassword123!` |

---

## Commands

```bash
# Local (SQLite db/demo.sqlite3)
cd skilled_hub_api
$env:RAILS_ENV="demo"
$env:ALLOW_DEMO_RESET="true"
$env:DEMO_MODE="true"
rails db:prepare
rails demo:reset    # clear + seed
rails demo:seed     # seed only (no clear)

# Aliases
rails db:seed:demo  # same as demo:seed
```

---

## Local frontend (demo UI)

```bash
cd skilled-hub-frontend
cp .env.demo .env.local   # or merge vars
npm run dev
```

Use `VITE_DEMO_MODE=true` and `VITE_API_BASE_URL=http://localhost:3000/api/v1` when API runs with `RAILS_ENV=demo`.

---

## Railway (demo API)

Create a **new** service + **new** Postgres plugin.

| Variable | Value |
|----------|--------|
| `RAILS_ENV` | `demo` |
| `RAILS_MASTER_KEY` | Same as production app |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (demo plugin only) |
| `DEMO_MODE` | `true` |
| `ALLOW_DEMO_RESET` | `true` |
| `STRIPE_SECRET_KEY_TEST` | `sk_test_...` only |
| `APP_HOST` | Your demo API host (HTTPS) |
| `CORS_ORIGINS` | `https://demo.techflash.app` |

**Do not set:** `STRIPE_SECRET_KEY` (live), `TWILIO_*`, production `DATABASE_URL`.

**Important:** Dockerfile bakes `RAILS_ENV=production` at build time; set `RAILS_ENV=demo` in Railway **runtime** variables (overrides image default).

After first deploy:

```bash
railway run rails db:prepare
railway run rails demo:reset
```

---

## Vercel (demo frontend)

| Variable | Value |
|----------|--------|
| `VITE_DEMO_MODE` | `true` |
| `VITE_API_BASE_URL` | `https://<your-demo-api>/api/v1` |
| `VITE_DEMO_APP_URL` | `https://demo.techflash.app` |
| `VITE_STRIPE_PUBLISHABLE_KEY_TEST` | `pk_test_...` |

Build command: `npm run build:demo`

Domain: `demo.techflash.app`

---

## Vercel (production — admin card only)

| Variable | Value |
|----------|--------|
| `VITE_DEMO_APP_URL` | `https://demo.techflash.app` |

No demo DB credentials on production.

---

## Safety checks (enforced in code)

- `demo:reset` / `POST /api/v1/admin/demo_reset` refuse `RAILS_ENV=production`
- Require `ALLOW_DEMO_RESET=true`
- Require `RAILS_ENV=demo` (or local `db/demo.sqlite3`)
- `DATABASE_URL` must include `demo` in host/db name (or set `DEMO_DATABASE_NAME`)
- Mail, SMS, and Stripe charges are simulated in demo

---

## Guided walkthrough

1. Log in as demo admin on the demo site.
2. Open **Dashboard** → **Start Demo** (header or floating button).
3. 16 steps highlight admin metrics, jobs, messages, settings, masquerade, and reset.
4. Step 5 opens the Houston showcase job automatically when seeded.
5. Progress stored in `localStorage` (`techflash_demo_tour_v1`).

---

## Seed contents

- **96 jobs** (32 each): Houston, Austin, Dallas
- Status mix: open, claimed, in progress, pending review, completed with reviews
- ~24 companies, ~45 technicians, messages, ratings, payments (`pi_demo_*`), notifications

---

## Risks and limitations

- HTTP reset may timeout on slow hosts — use `rails demo:reset` in Railway console.
- Walkthrough targets may be missing until you navigate to the right page; steps include fallback copy.
- Masquerade from production into demo is impossible (separate origins/JWT).
- Claim/payment flows simulate success in demo (no real Stripe UI).
