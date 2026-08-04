/**
 * iOS v1 release guard:
 * Membership purchase/upgrade flows are disabled on iOS until a compliant
 * in-app billing strategy is approved and implemented.
 */
export const IOS_V1_MEMBERSHIP_PURCHASE_ENABLED = false;

export function canInitiateMembershipPurchase(platformOs: string): boolean {
  if (platformOs !== 'ios') return true;
  return IOS_V1_MEMBERSHIP_PURCHASE_ENABLED;
}

/**
 * Removal note:
 * Set IOS_V1_MEMBERSHIP_PURCHASE_ENABLED to true (or remove this guard) only
 * after iOS billing policy sign-off and release readiness verification.
 */
