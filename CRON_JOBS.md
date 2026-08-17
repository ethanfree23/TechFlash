# Cron Jobs

Schedule these so payments release and review reminders work in production.

**Railway Cron is not configured in this repo.** `skilled_hub_api/railway.json` has no schedule. Add jobs in the Railway (or host) dashboard.

## 1. Payment release (hourly)

Settles finished jobs, then transfers when:

- both parties reviewed **or** 72h since `finished_at`
- ledger fully funded
- technician Connect is payout-ready
- no existing successful technician transfer

```bash
cd /path/to/skilled_hub_api && bundle exec rails payments:release_eligible
```

**Railway Cron example**

- Schedule: `0 * * * *` (hourly)
- Command: `bundle exec rails payments:release_eligible`

**HTTP alternative** (if rake-in-cron is awkward):

```
POST /api/v1/internal/payments/release_eligible
Header: X-Payments-Cron-Secret: <PAYMENTS_CRON_SECRET>
```

Verbose skip reasons: `VERBOSE=1 bundle exec rails payments:release_eligible`

Diagnostics (manual): `bundle exec rails payments:diagnose`

## 2. Review reminders (daily)

```bash
cd /path/to/skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```

**Example crontab (09:00):**

```
0 9 * * * cd /path/to/skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```

## Other hosts

- **Heroku**: Scheduler for daily review reminders; hourly payments via Scheduler or a third-party cron hitting the HTTP endpoint.
- **Render / Fly.io**: dashboard cron or an external ping to the protected HTTP endpoint.
