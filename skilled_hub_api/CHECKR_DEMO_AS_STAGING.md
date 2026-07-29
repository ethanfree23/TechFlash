# Checkr Demo-As-Staging Rollout

This project uses the existing TechFlash demo deployment as the Checkr staging test environment.

## Environment mapping

- Demo (`RAILS_ENV=demo`)
  - Connect to Checkr staging (`CHECKR_ENVIRONMENT=staging`)
  - Use staging secret key (`CHECKR_SECRET_KEY`)
  - Use staging packages (`CHECKR_DEFAULT_PACKAGE`)
  - Keep manual bypass available (`CHECKR_DEMO_BYPASS`)
- Production (`RAILS_ENV=production`)
  - Keep production Checkr disabled until authorization (`CHECKR_PRODUCTION_ENABLED=false`)

## Required backend env vars

```bash
CHECKR_ENABLED=true
CHECKR_BACKGROUND_CHECKS_ENABLED=true
CHECKR_ENVIRONMENT=staging
CHECKR_API_BASE_URL=https://api.checkr.com
CHECKR_SECRET_KEY=<checkr_staging_secret>
CHECKR_WEBHOOK_SECRET=<checkr_webhook_secret>
CHECKR_WEBHOOK_URL=https://<demo-domain>/api/v1/webhooks/checkr
CHECKR_DEFAULT_PACKAGE=<staging_package_slug>
CHECKR_DEMO_BYPASS=false
CHECKR_PRODUCTION_ENABLED=false
```

Legacy fallback vars are still supported (`CHECKR_STAGING_API_KEY`, `CHECKR_API_KEY`) to avoid breaking older configs.

## Runtime behavior

- `CHECKR_ENABLED` and `CHECKR_BACKGROUND_CHECKS_ENABLED` gate Checkr calls globally.
- `CHECKR_PRODUCTION_ENABLED` blocks Checkr calls when `CHECKR_ENVIRONMENT=production`.
- Consent capture remains required (`disclosure_accepted_at`, `authorization_accepted_at`, `consent_ip`).
- Demo bypass remains available and additive.

## Webhook route

- Primary: `POST /api/v1/checkr/webhook`
- Alias: `POST /api/v1/webhooks/checkr`

## Phase rollout

### Phase 1
- Configure demo env with staging key + webhook secret.
- Keep `CHECKR_DEMO_BYPASS` available for emergency fallback.
- Validate candidate creation, invitation creation, hosted flow redirect, and webhook processing.

### Phase 2
- Keep demo default on real Checkr staging (`CHECKR_DEMO_BYPASS=false`).
- Only enable bypass explicitly if needed.
- Record certification video from demo deployment.

### Phase 3
- Add production credentials only after Checkr grants production authorization.
- Keep `CHECKR_PRODUCTION_ENABLED=false` initially.
- Perform controlled smoke test.
- Enable production mode only after successful validation.

## Rollback

```bash
CHECKR_ENABLED=false
# or
CHECKR_DEMO_BYPASS=true
```

Then redeploy/restart. Do not delete existing Checkr records, migrations, consent data, or bypass code.
