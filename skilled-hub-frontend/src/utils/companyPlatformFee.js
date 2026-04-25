/**
 * Company platform fee on job total (matches MembershipPolicy.company_commission_percent).
 * @param {number|null|undefined} effectiveCommissionPercent
 * @returns {number} multiplier e.g. 1.10 for 10%
 */
export function companyPayMultiplier(effectiveCommissionPercent) {
  const p = Number(effectiveCommissionPercent);
  if (!Number.isFinite(p) || p < 0) return 1;
  return 1 + p / 100;
}

export function companyChargeFromJobAmount(jobAmount, effectiveCommissionPercent) {
  return jobAmount * companyPayMultiplier(effectiveCommissionPercent);
}

/** Display string for percent (e.g. 10, 4.5) */
export function formatPlatformFeePercent(effectiveCommissionPercent) {
  const n = Number(effectiveCommissionPercent);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Prefer nested company profile; else infer from stored job amounts (cents). */
export function resolvedCompanyFeePercentFromJob(job) {
  const raw = job?.company_profile?.effective_commission_percent;
  if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  const amtCents = job?.job_amount_cents ?? job?.price_cents ?? 0;
  const chCents = job?.company_charge_cents;
  if (amtCents > 0 && chCents != null && chCents > 0) {
    return ((chCents / amtCents) - 1) * 100;
  }
  return null;
}
