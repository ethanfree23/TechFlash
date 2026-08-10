# Masquerade + Demo Switching QA Matrix

## Scope
Validate stable account switching between production admin, demo admin, demo company, and demo technician after masquerade hardening.

## Scenarios

| Scenario | Steps | Expected |
| --- | --- | --- |
| Demo admin -> demo technician -> return admin | In demo: Settings -> Account role -> switch to Technician -> click Return to Demo Admin | Lands on `Settings?tab=account` as `demo.admin@techflash.app` with admin role; no random profile |
| Demo admin -> demo company -> return admin | In demo: switch to Company -> return admin from panel or banner | Restores original demo admin session from saved snapshot |
| Nested masquerade restore safety | In admin user list: masquerade user A, then user B, then exit | Returns to original admin (not user A) |
| Deleted canonical demo technician | Delete `demo.tech@techflash.app`, then try technician switch | Clear error: demo technician missing and prompt to run Demo Reset |
| Recreated/reset demo data | Run demo reset, then switch roles again | Switch works without stale user ID failures |
| Missing snapshot recovery | Clear session storage while masquerading, then exit | Session is cleared and redirected to login instead of landing on wrong account |
| Production admin -> Open Demo Admin | Prod Settings -> Account role -> Demo Admin card | Opens demo app in new tab and auto-logs into canonical demo admin account |

## Verification Notes (this change set)
- Implemented canonical lookup endpoint: `GET /api/v1/admin/masquerade/demo_accounts`.
- Frontend now refreshes canonical IDs from server before each switch (no stale one-time IDs).
- Masquerade snapshot is only captured once (from the original admin), preventing overwrite during nested masquerades.
- Exit masquerade now requires both token + user snapshot; otherwise it clears session and routes to login.

## Automated checks run
- `node scripts/auth.test.mjs` (passed)
- `bin/rails test test/controllers/api/v1/admin/masquerades_controller_test.rb` (invoked in this shell; no runtime output due local Ruby tooling constraints)
