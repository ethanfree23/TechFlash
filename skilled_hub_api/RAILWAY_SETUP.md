# Railway Environment Variables

Add these in Railway → Your API Service → Variables:

| Variable | Value |
|----------|-------|
| `RAILS_MASTER_KEY` | Contents of `config/master.key` |
| `RAILS_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference your Postgres service) |
| `STRIPE_SECRET_KEY` | Stripe **live** secret key (`sk_live_...`) — production only; do not set `STRIPE_SECRET_KEY_TEST` here |
