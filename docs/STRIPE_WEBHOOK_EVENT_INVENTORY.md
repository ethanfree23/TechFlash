# Stripe Webhook Event Inventory (Stage 2)

Stripe API behavior assumed: current Stripe Ruby gem defaults. Handler: `Api::V1::StripeWebhooksController`.

Idempotency: `stripe_webhook_events.stripe_event_id` unique + `processed_at` only after successful handling (deferred Checkr steps included).

Connected-account events (`event.account` present) are isolated to `CONNECTED_ACCOUNT_EVENT_TYPES` and never reach platform ledger/membership handlers.

## Platform destination events

| Event | Handler | Business effect | Launch required? | Implemented? | Duplicate delivery |
|---|---|---|---|---|---|
| `payment_intent.processing` | `reconcile_payment_intent_processing` | ACH in-flight; job stays unpublished | Yes (ACH) | Yes | Idempotent status write |
| `payment_intent.succeeded` | `reconcile_payment_intent_succeeded` | Mark collection succeeded; publish job if initial charge | Yes | Yes | No-op if already succeeded |
| `payment_intent.payment_failed` | `reconcile_payment_intent_failed` | Pre-success → failed; post-success → investigation risk (never silent downgrade) | Yes | Yes | Idempotent |
| `setup_intent.succeeded` | `reconcile_setup_intent` | Upsert `StripeSetupRecord`; does **not** fund jobs | Yes (ACH) | Yes | Unique SetupIntent ID |
| `setup_intent.setup_failed` | `reconcile_setup_intent` | Mark setup failed; method unavailable | Yes (ACH) | Yes | Does not overwrite newer success |
| `setup_intent.canceled` | `reconcile_setup_intent` | Mark canceled | Recommended | Yes | Idempotent |
| `setup_intent.requires_action` | `reconcile_setup_intent` | Track verification pending | Recommended | Yes | Idempotent |
| `checkout.session.completed` | membership / BG checkout | Membership sync or BG paid+fulfill | Yes | Yes (Stage 1) | Deferred Checkr + processed_at |
| `checkout.session.async_payment_succeeded` | BG checkout | ACH Checkout paid | Yes | Yes (Stage 1) | Same as above |
| `checkout.session.async_payment_failed` | BG failed payment | Mark BG payment failed | Yes | Yes (Stage 1) | Idempotent |
| `customer.subscription.created/updated` | membership sync | Entitlements (active/trialing/past_due) | Yes | Yes (Stage 1) | Stale-event guard |
| `customer.subscription.deleted` | reset membership | Default free tier | Yes | Yes (Stage 1) | Targeted column writes |
| `invoice.paid` | membership email | Receipt email | Optional | Yes | Deduped |
| `charge.refunded` | `reconcile_charge_refunded` | Ledger refund reconcile | Yes | Yes (Stage 1) | Unique idempotency / refund ID |
| `refund.created` | `reconcile_refund_object` | Same refund path | Yes | Yes | Shared reconcile |
| `refund.updated` | `reconcile_refund_object` | Status sync pending→succeeded/failed | Yes | Yes | Shared reconcile |
| `refund.failed` | `reconcile_refund_object` | Mark refund failed | Yes | Yes | Shared reconcile |
| `charge.dispute.created/updated/closed` | `reconcile_charge_dispute` | Dispute fields + `PaymentRiskEvent` | Yes (ACH) | Yes | Updates same dispute IDs |

### Not subscribed / intentionally omitted (platform)

| Event | Reason |
|---|---|
| `charge.dispute.funds_reinstated` / `funds_withdrawn` | Optional; dispute status already tracked. Add if finance needs finer cash movement. |
| `transfer.created/updated/reversed` | Platform creates transfers with local ledger; no auto-reversal. Can add later for audit. |
| All other Stripe events | Logged as unhandled; return 200 after persistence. |

## Connect destination events

| Event | Handler | Business effect | Launch required? | Implemented? | Notes |
|---|---|---|---|---|---|
| `account.updated` | `sync_connected_account` | Technician Connect readiness | Yes | Yes (Stage 1) | Validates `event.account` |
| `payout.created/updated/paid/failed/canceled/reconciliation_completed` | `reconcile_connected_payout` | Log account-level payout; **job attribution = unknown** | Recommended | Yes (log-only) | Does not invent per-job bank payout certainty |

### Not auto-attributed

`payout.paid` does **not** prove a specific job transfer reached a bank account without balance-transaction reconciliation. Admin UI shows `bank_payout_status: unknown` unless proven.

## Exact subscription lists

### Staging platform destination
All Implemented? = Yes rows under Platform above.

### Staging Connect destination
`account.updated` + payout.* rows under Connect above.

### Future live platform / Connect
Same lists after production ACH enablement (coordinator-owned). Live keys + live webhook secrets required.

## Signing secrets (env names)

- Platform: `STRIPE_WEBHOOK_SECRET`
- Connect: `STRIPE_CONNECT_WEBHOOK_SECRET`

Staging and production both require platform secret (`webhook_secret_required?`).
