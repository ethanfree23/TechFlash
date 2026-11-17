# Technician Activation CRM — Architecture

## Audit summary

### Current Admin Users experience
- Page: `skilled-hub-frontend/src/pages/AdminUsersPage.jsx`
- Snapshot drawer: `UserDrawer.jsx` (identity → actions → stats → completeness → **local notes** → activity → communication)
- Filters/tabs are mostly client-side over a full census from `GET /api/v1/admin/users`
- Focus star is the only technician ops flag persisted today (`users.admin_starred`)

### Local-only admin notes
- Key: `admin_user_notes_{userId}`
- Shape: `{ id: number, body: string, at: ISO8601, admin: string }`
- Explicitly labeled “Local only until backend notes API exists.”
- **Must be migrated, never silently discarded.**

### Company CRM (do not reuse for technicians)
- `CrmLead` / `CrmNote` are company-only (`linked_target_must_be_company`)
- Mature call/note/reminder UX lives under `/crm`
- Linking technicians into company CRM would break invariants and pollute sales pipeline

### Reusable pieces
- `TechnicianVerificationInventory` — license / references / background check (source of truth)
- `AdminUserDetail` + list `list_item` — extend, don’t fork
- Drawer UI patterns (`DrawerSection`, badges, action row)
- Company CRM call UX patterns (quick outcomes, remind_at) — **inspired by**, not shared tables
- Admin auth: `authenticate_user` + `require_admin`

### Gaps
- No technician notes / interactions / follow-up tasks tables
- No activation pipeline status distinct from verification/membership
- No Log Call flow on the user drawer
- Onboarding checklist in drawer is a simplified client formula; verification inventory is richer

---

## Design principles
1. Separate **admin CRM status** from **system facts** (verification, Stripe, membership, job eligibility).
2. Never grant job eligibility or bypass Checkr/Stripe rules via CRM status.
3. Persist everything server-side; migrate browser-local notes explicitly.
4. Keep company CRM untouched.
5. Optimize for: filter → open → call → log → schedule → next tech.

---

## Schema

### `technician_activations` (1:1 with technician `users`)
| Column | Purpose |
|--------|---------|
| `user_id` | FK, unique |
| `status` | Admin CRM pipeline status (default `new`) |
| `last_contacted_at` | Denormalized from interactions |
| `last_interaction_type` | Denormalized |
| `last_call_outcome` | Denormalized from latest call |
| `next_follow_up_at` | Denormalized from earliest open follow-up |
| `current_availability` | Admin-facing availability label (`unknown`, `available_now`, `available_soon`, `not_available`) — **not** job eligibility |
| `status_updated_at` / `status_updated_by_id` | Audit of manual status changes |

**Statuses:** `new`, `contacting`, `engaged`, `onboarding`, `ready`, `available`, `placed`, `nurture`, `unresponsive`, `disqualified`

Manual CRM status never implies verification cleared or jobs unlocked.

### `technician_interactions`
Immutable-ish activity log (updates rare; create-focused).

| Column | Purpose |
|--------|---------|
| `user_id` | Technician |
| `author_id` | Admin author |
| `interaction_type` | `note`, `call`, `voicemail`, `sms`, `email`, `follow_up`, `status_change` |
| `outcome` | Call outcomes when applicable |
| `body` | Free text |
| `follow_up_at` | Optional next touch suggested at log time |
| `occurred_at` | Event time (preserves migrated local note timestamps) |
| `client_key` | Idempotency / local migration dedupe (`user_id` + `client_key` unique) |
| `metadata` | JSON (`previous_status`, `new_status`, `local_id`, etc.) |

**Call outcomes:** `connected`, `left_voicemail`, `no_answer`, `requested_callback`, `wrong_number`, `not_interested`

### `technician_follow_ups`
Durable tasks.

| Column | Purpose |
|--------|---------|
| `user_id` | Technician |
| `assigned_admin_id` | Owner |
| `created_by_id` | Creator |
| `due_at` | When due |
| `status` | `open`, `completed`, `canceled` |
| `description` | Optional |
| `completed_at` | When completed |
| `technician_interaction_id` | Optional link to the call/note that spawned it |

---

## APIs (admin-only)

```
GET    /api/v1/admin/users/:user_id/technician_interactions
POST   /api/v1/admin/users/:user_id/technician_interactions
POST   /api/v1/admin/users/:user_id/technician_interactions/import_local
POST   /api/v1/admin/users/:user_id/log_call

GET    /api/v1/admin/users/:user_id/technician_activation
PATCH  /api/v1/admin/users/:user_id/technician_activation

GET    /api/v1/admin/users/:user_id/technician_follow_ups
POST   /api/v1/admin/users/:user_id/technician_follow_ups
PATCH  /api/v1/admin/technician_follow_ups/:id

GET    /api/v1/admin/technician_follow_ups?scope=due_today|overdue|...
GET    /api/v1/admin/technician_activation/pipeline_counts
```

`GET /api/v1/admin/users` list items gain an `activation` object for technicians (status, contact fields, next follow-up, onboarding blockers summary).

---

## Local notes migration
1. Drawer detects `admin_user_notes_{id}` contents.
2. Calls `import_local` with `{ notes: [...] }` (idempotent via `client_key = "local:{local_id}"`).
3. On success, clears that localStorage key and sets `admin_user_notes_migrated_{id}=1`.
4. If API fails, local notes remain; UI shows recoverable warning — never discard.

---

## Onboarding readiness
Service `TechnicianOnboardingReadiness` composes existing sources (no third formula for verification):
- Background check / trade license / references → `TechnicianVerificationInventory`
- Profile basics / photo → existing profile fields
- Payout setup → `stripe_account_id` / `stripe_payouts_enabled`
- Assessments → latest `technician_assessment_results` when present

Returns actionable blockers with deep links into existing admin workflows (edit profile, trust & safety, etc.).

---

## Frontend (within `/admin/users`)
1. Activation pipeline tabs / filters (never contacted, overdue follow-ups, ready, unresponsive, …)
2. Sortable columns: activation status, last contacted, last call outcome, next follow-up, blockers, availability
3. Drawer hierarchy for technicians:
   1. Identity + phone/contact
   2. Activation status + availability
   3. Log Call / Add Note / Schedule Follow-up
   4. Next action + onboarding blockers
   5. Interaction timeline
   6. Quick stats + platform history
4. Fast Log Call: one-click outcome → optional note + follow-up datetime → save (no full page reload)

---

## Safety
- Admin-only authorization on all new endpoints
- Input validation + clear errors
- `client_key` prevents duplicate call/note submissions
- No outbound call/SMS/email triggered by logging
- No Stripe / Checkr / job-eligibility rule changes
