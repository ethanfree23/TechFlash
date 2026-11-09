# ACH Direct Debit — Architecture & Decisions

## Current payment lifecycle (unchanged for cards)

1. Company saves a payment method in Settings (SetupIntent).
2. **Pay-to-post**: posting a priced job creates an off-session PaymentIntent and captures immediately.
3. Success → job `open` + `funding_status: funded`. 3DS → `pending_funding` until confirmed.
4. **Claim does not charge.** Technician payouts are Connect Transfers after both reviews **or** 72 hours, only when the ledger is fully funded with **succeeded** collections.

Platform fees come from Admin `MembershipTierConfig` snapshots — never hardcoded.

## ACH incompatibility with “immediate auth”

ACH Direct Debit is asynchronous. Stripe accepts a debit request (`payment_intent.processing`) days before funds settle (`payment_intent.succeeded`). Treating `processing` as collected would:

- List unfunded jobs
- Allow technician payouts against unsettled money
- Create return/NSF exposure after payout

## Approved ACH approach (implemented)

| Stage | Behavior |
|---|---|
| Connect bank | Stripe Financial Connections via SetupIntent (`us_bank_account`), automatic verification with microdeposit fallback |
| Mandate | Stripe SetupIntent / PaymentMethod mandate for future off-session debits |
| Post job (ACH default) | PaymentIntent created; on `processing`, job stays **`pending_funding`** / `adjustment_required` (same unpublished gate as 3DS) |
| ACH succeeds | Webhook `payment_intent.succeeded` publishes the job |
| ACH fails / returns | Webhook marks txn failed; job stays unpublished / adjustment required |
| Ledger / payouts | Only **succeeded** collections count as funded; processing ACH never unlocks Connect transfers |
| Cards | Unchanged immediate capture + 3DS path |

**Business rule (safe default):** ACH-funded jobs are **not** listed until the debit succeeds. This can take 1–5 business days. Cards remain immediate.

## Decision flags (product approval)

These are implemented with the safe defaults above. Changing them needs explicit product/finance approval:

1. **Publish-on-processing?** Rejected by default — would list jobs before funds clear.
2. **Pay technicians while ACH is processing?** Rejected — ledger and release guards require succeeded collections.
3. **Allow ACH for settlement top-ups / counteroffer deltas?** Allowed, but blocks settlement/fill until the ACH PI succeeds (same as 3DS).
4. **Mandate scope:** SetupIntent usage `off_session` for saved methods used for job funding charges. Companies must understand Settings copy: saved banks may be debited for posted jobs, counteroffer deltas, and settlement top-ups under TechFlash’s pay-to-post model.

## What is stored locally

Stripe PaymentMethod / PaymentIntent / Charge / Dispute IDs plus non-sensitive display fields (`payment_method_type`, bank name, last4, brand). **Never** raw account numbers, routing numbers, or bank login credentials.
