/**
 * Maps public API `membership_tier_configs` rows to UI-friendly plan view models.
 * Used by signup and future marketing surfaces — keep display logic here, not duplicated in JSX.
 */

function formatMoney(cents, suffix = '/month') {
  const n = Number(cents) || 0;
  if (n <= 0) return `$0${suffix}`;
  return `$${(n / 100).toFixed(2)}${suffix}`;
}

function defaultCommissionLabel(tier) {
  const pct = tier.commission_percent;
  if (pct == null || Number.isNaN(Number(pct))) return 'Commission set in plan details.';
  return `${pct}% commission on completed jobs`;
}

function defaultJobAccessLabel(tier) {
  if (tier.job_access_summary && String(tier.job_access_summary).trim()) return String(tier.job_access_summary).trim();
  const h = tier.early_access_delay_hours;
  if (h == null) return 'Job access timing follows platform rules for this tier.';
  if (Number(h) === 0) return 'Eligible to see new jobs as soon as they are posted (subject to profile rules).';
  return `New jobs may appear after a ${h}-hour window from post time (relative to higher tiers).`;
}

/**
 * @param {object} tier - raw tier from API
 * @param {'monthly'|'yearly'} billingInterval
 */
export function adaptMembershipTier(tier, billingInterval = 'monthly') {
  const monthlyCents = Number(tier.monthly_fee_cents) || 0;
  const yearlyCentsRaw = Number(tier.yearly_fee_cents) || 0;
  const yearlyCents = yearlyCentsRaw > 0 ? yearlyCentsRaw : monthlyCents * 12;
  const feeCents = billingInterval === 'yearly' ? yearlyCents : monthlyCents;
  const priceSuffix = billingInterval === 'yearly' ? '/year' : '/month';
  const features = Array.isArray(tier.feature_bullets)
    ? tier.feature_bullets.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    id: tier.slug,
    slug: tier.slug,
    name: tier.display_name || tier.slug,
    monthlyFeeCents: monthlyCents,
    yearlyFeeCents: yearlyCentsRaw,
    priceLabel: formatMoney(feeCents, priceSuffix),
    yearlySavingsLabel: tier.yearly_savings_label || '',
    features,
    jobAccessLabel: defaultJobAccessLabel(tier),
    commissionLabel:
      tier.commission_summary && String(tier.commission_summary).trim()
        ? String(tier.commission_summary).trim()
        : defaultCommissionLabel(tier),
    isPopular: !!tier.is_highlighted,
    requiresPayment: feeCents > 0,
    raw: tier,
  };
}

export function adaptMembershipTierList(tiers, billingInterval) {
  return (tiers || []).map((t) => adaptMembershipTier(t, billingInterval));
}
