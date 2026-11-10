# Stripe Webhook Event Inventory (Stage 2 corrective)

Handler: `Api::V1::StripeWebhooksController`  
Idempotency: `stripe_webhook_events.stripe_event_id` unique; `processed_at` only after successful handling (deferred Checkr steps included).  
Stripe Ruby gem uses the account’s default API version unless pinned in Dashboard destination settings. Prefer snapshot destinations compatible with existing handlers.

Connected-account events (`event.account` present) are isolated to Connect handlers and never reach platform ledger/membership handlers.

## Platform destination — one row per event

| Event | Destination | Handler | Business impact | Idempotency | Actively reconciled? | Required for ACH launch? |
|---|---|---|---|---|---|---|
| `payment_intent.processing` | Platform | `reconcile_payment_intent_processing` | ACH in-flight; job stays unpublished / pending_funding | Status write on locked txn | Yes | Yes |
| `payment_intent.succeeded` | Platform | `reconcile_payment_intent_succeeded` | Mark collection succeeded; may publish job | No-op if already succeeded | Yes | Yes |
| `payment_intent.payment_failed` | Platform | `reconcile_payment_intent_failed` | Pre-success → failed; post-success → **unconfirmed** investigation (`post_success_reversal_unconfirmed`). Never auto-classified as ACH return | Correlation key `unconfirmed_pi:{pi}` | Yes | Yes |
| `setup_intent.succeeded` | Platform | `reconcile_setup_intent` → `StripeSetupRecord` | Persist bank/card setup; **does not fund jobs** | Unique SetupIntent ID; success not overwritten by later failure | Yes | Yes |
| `setup_intent.setup_failed` | Platform | `reconcile_setup_intent` | Mark setup failed; method unavailable | Same SetupIntent row | Yes | Yes |
| `setup_intent.canceled` | Platform | `reconcile_setup_intent` | Mark canceled unless already succeeded | Same SetupIntent row | Yes | Recommended |
| `setup_intent.requires_action` | Platform | `reconcile_setup_intent` | Verification pending | Same SetupIntent row | Yes | Recommended |
| `checkout.session.completed` | Platform | membership / BG checkout | Membership sync or BG paid + deferred Checkr | Stage 1 deferred + processed_at | Yes | Yes |
| `checkout.session.async_payment_succeeded` | Platform | BG checkout | ACH Checkout paid | Same as above | Yes | Yes |
| `checkout.session.async_payment_failed` | Platform | BG failed payment | Mark BG payment failed | Idempotent | Yes | Yes |
| `customer.subscription.created` | Platform | membership sync | Entitlements | Stale-event guard | Yes | Yes |
| `customer.subscription.updated` | Platform | membership sync | Entitlements (active/trialing/past_due) | Stale-event guard | Yes | Yes |
| `customer.subscription.deleted` | Platform | reset membership | Default free tier | Targeted column writes | Yes | Yes |
| `invoice.paid` | Platform | membership email | Receipt email | Deduped | Yes | Optional |
| `charge.refunded` | Platform | `reconcile_charge_refunded` | Ledger refund reconcile (Charge payload) | Unique refund / idempotency | Yes | Yes |
| `refund.created` | Platform | `reconcile_refund_object` | Shared refund path | Shared reconcile | Yes | Yes |
| `refund.updated` | Platform | `reconcile_refund_object` | pending→succeeded/failed | Shared reconcile | Yes | Yes |
| `refund.failed` | Platform | `reconcile_refund_object` | Mark refund failed | Shared reconcile | Yes | Yes |
| `charge.dispute.created` | Platform | `reconcile_charge_dispute` | Open dispute risk; ACH collection → **confirmed** `post_success_return`; card → `post_success_dispute`. Deduped by `correlation_key=dispute:{id}` | Unique correlation_key | Yes | Yes |
| `charge.dispute.updated` | Platform | `reconcile_charge_dispute` | Lifecycle → under_review / confirmed_return | Same dispute key | Yes | Yes |
| `charge.dispute.closed` | Platform | `reconcile_charge_dispute` | Lifecycle won/lost/unknown; **does not auto-unblock** transfers | Same dispute key | Yes | Yes |
| `charge.dispute.funds_withdrawn` | Platform | `reconcile_charge_dispute` | Lifecycle funds_withdrawn; exposure confirmed | Same dispute key | Yes | Yes (ACH) |
| `charge.dispute.funds_reinstated` | Platform | `reconcile_charge_dispute` | Lifecycle funds_reinstated; still needs admin resolve to clear block | Same dispute key | Yes | Yes (ACH) |
| `transfer.created` | Platform | `reconcile_platform_transfer` → `PaymentService.reconcile_transfer_from_stripe_object!` | Resolves `outcome_unknown` technician transfer to succeeded when metadata matches | Transfer ID / txn metadata | Yes | Yes |
| `transfer.updated` | Platform | same | Same idempotent resolve | Same | Yes | Recommended |

## Connect destination — one row per event

| Event | Destination | Handler | Business impact | Idempotency | Actively reconciled? | Required for ACH launch? |
|---|---|---|---|---|---|---|
| `account.updated` | Connect | `sync_connected_account` | Technician Connect readiness | Validates `event.account` | Yes | Yes |
| `payout.created` | Connect | `reconcile_connected_payout` | Log account-level payout; job attribution **unknown** | Log-only | Log-only | Recommended |
| `payout.updated` | Connect | `reconcile_connected_payout` | Same | Log-only | Log-only | Recommended |
| `payout.paid` | Connect | `reconcile_connected_payout` | Same — **not** proven per-job bank arrival | Log-only | Log-only | Recommended |
| `payout.failed` | Connect | `reconcile_connected_payout` | Same | Log-only | Log-only | Recommended |
| `payout.canceled` | Connect | `reconcile_connected_payout` | Same | Log-only | Log-only | Recommended |
| `payout.reconciliation_completed` | Connect | `reconcile_connected_payout` | Same | Log-only | Log-only | Optional |

## Intentionally omitted / not subscribed

| Event | Reason |
|---|---|
| `transfer.reversed` | Platform creates transfers with local ledger; no auto-reversal. `transfer.created`/`updated` are handled (see Platform table) |
| `account.external_account.updated` | Not required for current readiness path |
| All other Stripe events | Persisted if delivered; logged unhandled; HTTP 200 after persistence |

## Exact subscription lists

### Staging platform destination
Every Platform row above with Actively reconciled? = Yes.

### Staging Connect destination
Every Connect row above.

### Existing live platform destination (today)

```
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
```

### Existing live Connect destination (today)

```
account.updated
```

### ADDITIVE changes required at production ACH launch

**Do not modify live destinations until coordinator enables production ACH.**

Live platform — **ADD**:

```
payment_intent.processing
setup_intent.succeeded
setup_intent.setup_failed
setup_intent.canceled
setup_intent.requires_action
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

Live Connect — **ADD**:

```
payout.created
payout.updated
payout.paid
payout.failed
payout.canceled
payout.reconciliation_completed
```

## Signing secrets (env names)

| Env | Platform secret | Connect secret |
|---|---|---|
| Staging | `STRIPE_WEBHOOK_SECRET` (ENV only; no credentials fallback) | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Production | `STRIPE_WEBHOOK_SECRET` (ENV or credentials) | `STRIPE_CONNECT_WEBHOOK_SECRET` |

## Classification notes

- `payment_intent.payment_failed` after local success → **unconfirmed** investigation only.
- ACH post-success returns → Stripe `charge.dispute.*` on a `us_bank_account` collection → **confirmed** `post_success_return`.
- Card disputes → `post_success_dispute` (not ACH return).
- `charge.dispute.closed` ≠ funds reinstated; transfer blocks remain until admin resolve.
- No automatic transfer reversals or technician clawbacks.
