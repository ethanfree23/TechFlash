# Demo environment — TechFlash

Isolated demo stack for in-person company and investor presentations. **Never** point demo reset tasks or `DATABASE_URL` at production.

## Architecture

| Layer | Production | Demo |
|-------|------------|------|
| Frontend | `https://techflash.app` | `https://techflash.app/demo` (same Vercel deploy, path prefix) |
| API | Railway `RAILS_ENV=production` | Railway `RAILS_ENV=demo` (separate service) |
| Database | Production Postgres | **Separate** demo Postgres |

Demo auth uses prefixed `localStorage` keys (`demo_token`, etc.) so production and demo sessions on the same domain do not overwrite each other.

Production admin: **Settings → Account → Account role** or the command-center card links to `/demo/login`. Demo admin can **Reset Demo Data** and run the guided walkthrough.

---

## Demo URLs

| Page | URL |
|------|-----|
| Demo login | `https://techflash.app/demo/login` |
| Auto-login admin | `https://techflash.app/demo/login?demo=admin&auto=1` |
| Demo dashboard | `https://techflash.app/demo/dashboard` |

No `demo.techflash.app` subdomain is required.

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

**Option A — path prefix (matches production):**

```bash
cd skilled-hub-frontend
# .env.local: VITE_DEMO_API_BASE_URL=http://localhost:3000/api/v1
npm run dev
# Open http://localhost:5173/demo/login
```

**Option B — VITE_DEMO_MODE without /demo prefix:**

```bash
cp .env.demo .env.local
npm run dev
# Open http://localhost:5173/login
```

Run the API with `RAILS_ENV=demo` in both cases.

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
| `CORS_ORIGINS` | `https://techflash.app` |

**Do not set:** `STRIPE_SECRET_KEY` (live), `TWILIO_*`, production `DATABASE_URL`, **`REDIS_URL`** (unless you add Redis to demo — otherwise company/tech login fails when cache cannot connect).

**Company/tech login fails, admin works:** remove `REDIS_URL` from demo variables or deploy the latest `config/environments/demo.rb` (`cache_store = :memory_store`).

**Stripe boot error** (`Demo environment cannot use a live Stripe secret key`): on the **demo** service, delete `STRIPE_SECRET_KEY` (check **Shared Variables** too — duplicated envs often inherit production). Add `STRIPE_SECRET_KEY_TEST` = your `sk_test_...` key. Redeploy, then run `db:prepare` again.

After first deploy:

```bash
railway run rails db:prepare
railway run rails demo:reset
```

---

## Vercel (production frontend — single deploy)

Standard `npm run build` on `techflash.app`. Add:

| Variable | Value |
|----------|--------|
| `VITE_DEMO_APP_URL` | `https://techflash.app/demo` |
| `VITE_DEMO_API_BASE_URL` | `https://<your-demo-railway-host>/api/v1` |

When the browser path starts with `/demo`, the app uses the demo API and demo UI. No second Vercel project or subdomain.

Optional for local-only forced demo UI: `VITE_DEMO_MODE=true` in `.env.local`.

---

## Safety checks (enforced in code)

- `demo:reset` / `POST /api/v1/admin/demo_reset` refuse `RAILS_ENV=production`
- Require `ALLOW_DEMO_RESET=true`
- Require `RAILS_ENV=demo` (or local `db/demo.sqlite3`)
- Mail, SMS, and Stripe charges are simulated in demo

---

## Guided walkthrough

1. Open `https://techflash.app/demo/login?demo=admin&auto=1` (or sign in manually).
2. **Dashboard** → **Start Demo**.
3. Role switching: **Settings → Account → Account role** (expand with the chevron).

---

## Seed contents

- **96 jobs** (32 each): Houston, Austin, Dallas
- Status mix: open, claimed, in progress, pending review, completed with reviews
- ~24 companies, ~45 technicians, messages, ratings, payments (`pi_demo_*`), notifications
