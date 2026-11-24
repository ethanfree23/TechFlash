import React, { useEffect, useState } from 'react';
import { membershipsAPI, membershipTierConfigsAPI } from '../../../api/api';
import { OnboardingActions } from '../OnboardingShell';

function formatMoney(cents) {
  if (cents == null) return '—';
  if (Number(cents) === 0) return 'Free';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
}

export default function MembershipStep({ section, onBack, onContinue }) {
  const [tiers, setTiers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmUpgrade, setConfirmUpgrade] = useState(null);
  const [error, setError] = useState('');

  const current = section?.membership || {};

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      membershipTierConfigsAPI.list('technician').catch(() => []),
      membershipsAPI.get().catch(() => null),
    ]).then(([tierPayload, mem]) => {
      if (cancelled) return;
      const list = Array.isArray(tierPayload)
        ? tierPayload
        : tierPayload?.membership_tier_configs || tierPayload?.tiers || [];
      const techTiers = list.filter((t) => !t.audience || t.audience === 'technician');
      setTiers(techTiers);
      setMembership(mem);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startUpgrade = async (slug) => {
    if (!confirmUpgrade || confirmUpgrade !== slug) {
      setConfirmUpgrade(slug);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await membershipsAPI.update({
        membership_level: slug,
        success_url: `${origin}/technician/onboarding?section=membership&membership=success`,
        cancel_url: `${origin}/technician/onboarding?section=membership&membership=cancel`,
      });
      if (res?.checkout_url || res?.url) {
        window.location.href = res.checkout_url || res.url;
        return;
      }
      // Free tier or admin-assigned — no checkout
      onContinue();
    } catch (e) {
      setError(e.message || 'Could not update membership.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading membership options…</p>;

  const currentLevel = (membership?.membership_level || current.level || 'basic').toLowerCase();

  return (
    <div>
      <p className="text-sm text-slate-600">
        Your membership affects platform fees and how quickly you see new jobs. Admin-assigned or complimentary plans are preserved — you are not required to purchase a plan you already have.
      </p>

      <div className="mt-4 rounded-2xl border border-tf-orange/30 bg-orange-50 px-4 py-3">
        <p className="text-sm font-semibold text-orange-950">Current membership</p>
        <p className="mt-1 text-base font-bold capitalize text-orange-900">{currentLevel}</p>
        {current.fee_waived ? <p className="text-xs text-orange-800 mt-1">Fee waived</p> : null}
        {current.has_subscription ? <p className="text-xs text-orange-800 mt-1">Active subscription on file</p> : null}
      </div>

      <div className="mt-5 grid gap-3">
        {tiers.map((tier) => {
          const slug = (tier.slug || tier.membership_level || '').toLowerCase();
          const isCurrent = slug === currentLevel;
          const price = tier.monthly_fee_cents ?? tier.price_cents;
          const isPaid = Number(price) > 0;
          return (
            <div
              key={slug || tier.display_name}
              className={`rounded-2xl border px-4 py-4 ${isCurrent ? 'border-tf-orange bg-orange-50/40' : 'border-slate-200'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{tier.display_name || slug}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatMoney(price)} / month</p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-tf-orange px-2.5 py-1 text-[11px] font-bold text-white">Current</span>
                ) : null}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {tier.commission_percent != null ? (
                  <li>Platform fee: {tier.commission_percent}%</li>
                ) : null}
                {tier.early_access_delay_hours != null ? (
                  <li>
                    Job access delay:{' '}
                    {Number(tier.early_access_delay_hours) === 0
                      ? 'Immediate'
                      : `${tier.early_access_delay_hours} hours`}
                  </li>
                ) : null}
                {(tier.feature_bullets || []).slice(0, 3).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {!isCurrent && isPaid ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => startUpgrade(slug)}
                  className="mt-3 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {confirmUpgrade === slug ? 'Confirm paid upgrade' : 'Upgrade (optional)'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {confirmUpgrade ? (
        <p className="mt-3 text-xs text-amber-700">
          Click again to confirm. You will not be charged without this explicit confirmation.
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions
          onBack={onBack}
          onContinue={onContinue}
          continueLabel="Keep current plan & Continue"
          loading={saving}
        />
      </div>
    </div>
  );
}
