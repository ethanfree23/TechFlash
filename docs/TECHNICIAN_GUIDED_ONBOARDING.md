# Technician Guided Onboarding

Mandatory TurboTax-style account setup for technicians. Feature-flagged and off by default.

## Feature flag

```bash
cd skilled_hub_api
bundle exec rake technician_onboarding:set_flag ENABLED=true   # enable
bundle exec rake technician_onboarding:set_flag ENABLED=false  # disable / rollback
```

Or via API (admin):

- `GET /api/v1/admin/technician_onboarding/settings`
- `PATCH /api/v1/admin/technician_onboarding/settings` `{ "enabled": true, "assessment_reminder_days": 3 }`

## Dry-run grandfathering report

```bash
bundle exec rake technician_onboarding:dry_run
# or GET /api/v1/admin/technician_onboarding/dry_run
```

Apply grandfathering only after review:

```bash
CONFIRM=1 bundle exec rake technician_onboarding:apply_grandfathering
```

### Grandfathering rules (conservative)

**Grandfather (mark complete without wizard):**

- ≥1 completed/credited job, or
- `background_verified` + Stripe payout ready + profile completeness ≥ 80%, or
- Activation `ready`/`available`/`placed` + background verified + completeness ≥ 60%

**Require onboarding:** incomplete profiles and ambiguous accounts (ambiguous defaults to require).

Admin “Require onboarding again” always wins and does not delete profile, Checkr, Stripe, membership, or assessment data.

## Completion requirements (technician actions)

| Section | Technician must |
|--------|------------------|
| Profile | First/last name, phone, trade, skill class, location (city/ZIP), availability |
| Verification | 3 professional references; license upload if credential claimed; start background check (external review may remain pending) |
| Notifications | Confirm preferences (optional channels may be declined) |
| Billing | Start/acknowledge Stripe Connect payout setup (external Stripe review may remain pending) |
| Membership | Confirm current tier (paid upgrades optional + explicit confirm) |

Pending Checkr/admin/Stripe review does **not** block finishing the wizard. Completing the wizard never marks a technician verified.

## Assessment reminders

After onboarding completion, an in-app assessment prompt is sent once when trade assessments remain incomplete.

```bash
bundle exec rake technician_onboarding:assessment_reminders
```

## Admin CRM

- Users list tabs: Guided setup not started / in progress / complete
- Filter: Guided setup
- Technician detail → Profile: Guided onboarding panel + “Require onboarding again”

## Rollback

1. `ENABLED=false bundle exec rake technician_onboarding:set_flag`
2. Routing returns to prior behavior (no wizard gate)
3. Onboarding rows remain for audit; no destructive cleanup required
