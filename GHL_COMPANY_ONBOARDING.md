# GHL → TechFlash company onboarding webhook

Contract for the GoHighLevel workflow that turns a Meta lead-form company into a TechFlash
company account. Written from the implemented code: `GhlCompanyPayload` (accepted keys and
normalization), `GhlCompanyOnboardingService` (idempotency and responses), and
`GhlCompanyProvisioner` (what gets written).

> **Status:** TechFlash side implemented. Nothing below exists in GHL yet: GHL egress from
> the build environment was blocked, so no custom fields, workflows, or webhook actions were
> created. Section 3 lists the proposed GHL mapping; every custom field in it is **PROPOSED**
> and still has to be created.

---

## 1. Endpoint

```
POST {API_BASE}/api/v1/webhooks/ghl/company_onboarding
Authorization: Bearer {GHL_WEBHOOK_SECRET}
Content-Type: application/json
```

- **Auth:** the same bearer secret as the technician webhook (`GHL_WEBHOOK_SECRET`, compared in
  constant time by `GhlWebhookAuthenticator`). A missing or wrong secret, or an unset secret on
  the server, returns `401` with an empty body and records nothing.
- **Sibling routes (unchanged):** `webhooks/ghl/technician_onboarding` and `webhooks/ghl/inbound_sms`.

---

## 2. TechFlash request contract (API keys)

Unknown keys are dropped. Values are trimmed. Blank values count as "not sent".

### Required on every call

| Key | Notes |
|---|---|
| `idempotency_key` | Unique per form submission. See §4. |
| `ghl_contact_id` | GHL contact id. Links the TechFlash user to the contact (unique per user). |
| `ghl_location_id` | GHL sub-account/location id. |
| `phone` | Mobile phone. Must normalize to a 10-digit US number (formatting and a leading `1` are ignored); otherwise `422 phone is invalid`. |

### Required only when a new company account is created

| Key | Notes |
|---|---|
| `email` | Login identity. Lower-cased. Required only when no existing account matches. |
| `company_name` | Required only when no existing account matches. |

### Optional: identity

| Key | Maps to | Notes |
|---|---|---|
| `first_name`, `last_name` | `users.first_name/last_name` | |
| `full_name` | split into first/last | Used only when first and last are both absent. |
| `ghl_conversation_id` | `users.ghl_conversation_id` | |
| `event` | *(ignored)* | Accepted but ignored. The event type is always `company_onboarding`. |

### Optional: business ZIP (company only, never a job location)

| Key | Maps to |
|---|---|
| `business_zip` (canonical) | `company_profiles.business_zip_code` |
| `business_zip_code`, `company_zip` | aliases for `business_zip` |

- The first 5-digit run is extracted (`77002-1234` → `77002`). A value with no 5-digit run
  leaves the field unset and adds a warning. `CompanyProfile` applies the same normalization,
  so company self-signup (`POST /api/v1/users`, `role: company`) fills the same
  `business_zip_code` column. Self-signup's existing `location` text is unchanged.
- **`zip`, `zip_code`, and `postal_code` are deliberately not accepted** on this endpoint.
- **The business ZIP is never copied to a job's `zip_code`, `address`, `city`, `state`,
  `location`, or coordinates, and is not exposed by the company-profile API serializers.**
  Every job collects its own location in the job-posting flow. Tests enforce this in Rails
  and in the frontend.

### Optional: hiring need

| Key | Maps to | Normalization |
|---|---|---|
| `primary_trade` | `company_profiles.industry`, `service_trades` | Normalized to TechFlash trade labels (`hvac` → `HVAC Technician`, `plumbing` → `Plumber`, …). |
| `trades_needed` | `service_trades` | A comma-, semicolon-, pipe-, or newline-separated string, or a JSON array. Unrecognized trades are kept verbatim in `hiring_context.trades_needed` with a warning, never in `service_trades`. |
| `staffing_type` | `company_profiles.staffing_intent` | One of `temporary`, `full_time`, `both`. Accepted spellings are below. An unrecognized value leaves the intent unset, is stored in `hiring_context.staffing_type_raw`, and adds a warning. It does **not** block onboarding. |
| `technicians_needed` | `hiring_context.technicians_needed` | Leading integer. Non-numeric text such as `5-10` is also kept as `technicians_needed_raw`. |
| `hiring_timeframe` | `hiring_context.hiring_timeframe` | Free text (for example the form's option label). |
| `technician_level` | `hiring_context.technician_level` | `apprentice`, `journeyman`, or `master`. Anything else is kept as `technician_level_raw`. |
| `pay_rate` | `hiring_context.pay_rate_cents` | Parsed as money: `$32.50` → `3250`. |
| `pay_min`, `pay_max` | `hiring_context.pay_min_cents/pay_max_cents` | Parsed as money. |
| `pay_range` | `hiring_context.pay_range` | Free text, for example `$30-$40/hr`. |

**`staffing_type` spellings** (case and punctuation are ignored):

- **`temporary`:** `temporary`, `temp`, `short term`, `contract`
- **`full_time`:** `full_time`, `full time`, `full-time`, `fulltime`, `permanent`, `direct hire`
- **`both`:** `both`, `either`, `Temporary / Full-Time`, `temp to hire`, `temporary or full time`, `temporary and full time`

### Optional: attribution (first touch wins)

`lead_source`, `meta_lead_id`, `meta_form_id`, `meta_ad_id`, `meta_adset_id`,
`meta_campaign_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` go to
`company_profiles.acquisition_attribution`, together with `ghl_contact_id`, `ghl_location_id`,
`first_onboarded_at`, and `last_onboarded_at`. Existing keys are never overwritten; only
`last_onboarded_at` moves.

### Example

```json
{
  "idempotency_key": "company_onboarding:meta_lead_123",
  "ghl_contact_id": "gc_001",
  "ghl_location_id": "loc_001",
  "first_name": "Dana",
  "last_name": "Reyes",
  "company_name": "Acme HVAC",
  "email": "owner@acmehvac.com",
  "phone": "+17135550101",
  "business_zip": "77002",
  "primary_trade": "HVAC",
  "trades_needed": "Electrician",
  "staffing_type": "Both",
  "technicians_needed": "3",
  "hiring_timeframe": "Within 2 weeks",
  "technician_level": "Journeyman",
  "pay_range": "$30-$40/hr",
  "lead_source": "meta",
  "meta_lead_id": "meta_lead_123",
  "meta_form_id": "form_9"
}
```

---

## 3. Proposed GHL mapping

The values that GHL's workflow webhook action would send. **Standard contact fields** exist in
every GHL location. **Custom fields are PROPOSED**: they have not been created, and their
final GHL keys will be whatever GHL assigns when they are. Use the real merge-field key from
GHL, not the placeholder names below.

| TechFlash key | GHL source | Status |
|---|---|---|
| `ghl_contact_id` | Contact id (standard) | exists |
| `ghl_location_id` | Location id (standard) | exists |
| `first_name`, `last_name`, `email`, `phone` | Contact standard fields | exist |
| `company_name` | Contact "Company Name" (standard) | exists; confirm the Meta form maps into it |
| `business_zip` | Contact "Postal Code" (standard) **or** a custom "Business ZIP" | decide in GHL; the Meta form ZIP is the business ZIP |
| `primary_trade` | custom "Primary Trade" (dropdown) | PROPOSED |
| `trades_needed` | custom "Trades Needed" (multi-select) | PROPOSED |
| `staffing_type` | custom "Staffing Type": Temporary / Full-Time / Both | PROPOSED |
| `technicians_needed` | custom "Technicians Needed" | PROPOSED |
| `hiring_timeframe` | custom "Hiring Timeframe" | PROPOSED |
| `technician_level` | custom "Technician Level" | PROPOSED; only if collected |
| `pay_range` (or `pay_min`/`pay_max`) | custom "Pay Range" | PROPOSED; only if collected |
| `meta_lead_id`, `meta_form_id`, `meta_ad_id`, … | Facebook lead-ads attribution on the contact/opportunity | confirm what the Meta integration exposes |
| `lead_source`, `utm_*` | Contact source / attribution | confirm |
| `idempotency_key` | built in the workflow, see §4 | n/a |

Values produced by SMS AI extraction (for example staffing type or technicians needed parsed
from a reply) use the same keys. The webhook can be re-sent after extraction with a **new**
`idempotency_key`, and the existing account is then updated, not duplicated.

---

## 4. Idempotency

| Situation | Result |
|---|---|
| Same `idempotency_key`, already processed | `200`, the original result plus `"replayed": true`. Nothing is re-applied, even if the body changed. |
| Same `idempotency_key`, previous attempt failed | Retried. `attempt_count` increments, and it succeeds if the data is now valid. |
| New `idempotency_key`, same contact/email/phone | `202`, existing account updated, `"created": false`. No duplicate user, profile, or CRM lead. |
| `idempotency_key` already used by a technician event | `409`, refused without touching the technician's event. |

- **Recommended key:** `company_onboarding:{meta lead id}`, which is unique per form
  submission. If a lead id isn't available, use `company_onboarding:{contact id}:{a
  per-submission value}`.
- **Don't use the contact id alone.** Every later submission from that contact would then be
  treated as a replay and ignored.
- Every attempt is logged in `ghl_webhook_events` with `event_type = company_onboarding`, the
  filtered payload, `attempt_count`, `processing_error`, and `processed_at`.

---

## 5. Matching and collisions

Existing users are looked up by `ghl_contact_id`, then email (case-insensitive), then
normalized phone.

| Situation | Result |
|---|---|
| No match | New company user + company profile + CRM lead. `202`, `"created": true`. |
| One existing **company** user | Updated. `matched_by` is `ghl_contact_id`, `email`, or `phone`. |
| Any match is a **technician or admin** | `409 A <role> account already exists for this email or phone`. Nothing changes. |
| Email and phone match **different** users | `409 Email and phone match different TechFlash accounts`. |
| **Only the phone** matches, and the payload has a different email | `409 Phone matches an existing TechFlash account with a different email` (shared office lines are not treated as identity). |

When an existing company is updated:

- **Never changed:** email (the login), password, and an existing GHL contact link. A
  differing value adds a warning instead.
- **Filled only if blank:** names, phone, company name, industry, business ZIP, and
  `service_trades` (only if the list is empty).
- **Latest non-blank wins:** `staffing_intent` and `hiring_context` keys, because they describe
  the current hiring need.
- **CRM:** an existing lead linked to the company is reused. Otherwise an **unlinked** lead with
  the same email is adopted. Otherwise a new lead is created. The status becomes `prospect`
  only from `lead`, `contacted`, `qualified`, or `proposal`; `prospect`, `customer`,
  `competitor`, `churned`, and `lost` are never changed. Each processed event adds a CRM note
  summarizing what was submitted. The existing `CrmProspectPromotion` moves the lead to
  `customer` when the company posts its first job. A CRM failure never blocks account
  creation; it shows up as a warning.

---

## 6. First-time password

- **New accounts:** get a random, unusable password (`password_set_by = "system"`). There is no
  default password or email-as-password, and no email is sent by the webhook.
- **Eligibility for the existing `/create-password` flow:** only when
  `password_set_by == "system"` and the user is a GHL-onboarded technician or a GHL-onboarded
  company (`company? && ghl_onboarded_at`). Self-signup and admin-created companies are not
  eligible, and their `/create-password` response is unchanged.
- **Response fields:** `password_setup_required: true` and `password_setup_path:
  "/create-password"`, so the GHL SMS can send `{FRONTEND_URL}/create-password`.
- **Flow:** the company enters their email, gets a code by email, verifies it, and sets a
  password. This is the unchanged start → verify → complete flow. Afterwards
  `password_set_by = "user"`, eligibility ends, and `/create-password` answers `already_setup`.
- **Existing accounts matched by the webhook:** keep their own password and are never made
  eligible.

---

## 7. Responses

**Success** (`202 Accepted`, or `200 OK` for a replay):

```json
{
  "success": true,
  "user_id": 42,
  "company_profile_id": 17,
  "crm_lead_id": 9,
  "created": true,
  "matched_by": null,
  "ghl_contact_id": "gc_001",
  "staffing_intent": "both",
  "password_setup_required": true,
  "password_setup_path": "/create-password",
  "warnings": []
}
```

A replay adds `"replayed": true`. `warnings` lists non-fatal normalization notes, such as an
unrecognized trade or staffing type, or an email that differs from the existing account's.

**Failure:** `{ "success": false, "error": "<message>" }` with one of these statuses:

| Status | Meaning |
|---|---|
| `401` | Bad or missing secret (empty body). |
| `409` | Collision, or an idempotency key used by another event type. |
| `422` | Missing required fields, invalid phone, or a new account without `email`/`company_name`. |

---

## 8. Staffing intent and jobs

- `staffing_intent` and `hiring_context` are **context only**. Onboarding never creates a job,
  for any intent.
- Jobs still go through the normal job-posting flow, where the company supplies every
  job-specific detail, including location.
- `jobs.potential_full_time` (the existing Potential Full-Time designation) defaults to `false`
  for every company, including `both` and `full_time`. Each job opts in individually.
