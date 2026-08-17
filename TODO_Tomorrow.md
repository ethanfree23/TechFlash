# Tomorrow's Tasks

## 1. Emails
- **Dev and production** emails need to work (or work for the first time)
- Improve design and copy
- Status: Needs investigation/setup

---

## 2. Stripe Setup (Full)
- Pay-to-post, job snapshots, membership Checkout, and Connect payout-readiness are implemented in code.
- Still **manual**: Railway Cron for `payments:release_eligible` (or HTTP cron with `PAYMENTS_CRON_SECRET`), Stripe webhook events listed in `PAYMENTS_SETUP.md`, and test-mode end-to-end with a real test card.
- Status: Code complete; production scheduler/webhook dashboard still needs a human.

---

## 3. GitHub Rename: skilledhub → techflash
- **Concern:** May require redoing connections to hosting and other apps
- Need to assess: Is the rename worth the migration effort?
- Status: Decision pending after impact assessment

---

*Created: Mar 22, 2025*
