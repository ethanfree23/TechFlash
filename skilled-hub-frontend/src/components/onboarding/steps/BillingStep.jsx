import React, { useState } from 'react';
import { settingsAPI } from '../../../api/api';
import { OnboardingActions } from '../OnboardingShell';

export default function BillingStep({ section, onBack, onContinue, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const payout = section?.payout || {};

  const startConnect = async () => {
    setSaving(true);
    setError('');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await settingsAPI.createConnectAccountLink(origin, {
        return_path: '/technician/onboarding?section=billing&connect=return',
        refresh_path: '/technician/onboarding?section=billing&connect=refresh',
      });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      setError('Could not open Stripe setup.');
    } catch (e) {
      setError(e.message || 'Could not start payout setup.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    // Technician can continue once they've started Connect or acknowledged they'll finish later
    // if payout is already ready. External Stripe review must not block completion.
    if (!payout.payout_ready && !payout.stripe_account_id) {
      // Allow continue after explicit skip acknowledgment via continuing — section mark happens in parent.
      // Soft nudge only.
    }
    await onRefresh?.();
    onContinue();
  };

  return (
    <div>
      <p className="text-sm text-slate-600">
        TechFlash pays technicians through Stripe Connect. This is how you receive earnings — separate from any membership fee.
      </p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-2">
        <p className="text-sm font-semibold text-slate-900">Payout account</p>
        <p className="text-sm text-slate-700">
          {payout.payout_ready
            ? 'Ready to receive payouts'
            : payout.stripe_account_id
              ? 'Started — Stripe may still need details or review'
              : 'Not started'}
        </p>
        {payout.details_submitted ? (
          <p className="text-xs text-slate-500">Details submitted to Stripe</p>
        ) : null}
      </div>

      {!payout.payout_ready ? (
        <button
          type="button"
          onClick={startConnect}
          disabled={saving}
          className="mt-5 min-h-12 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Opening Stripe…' : payout.stripe_account_id ? 'Continue payout setup' : 'Set up payout account'}
        </button>
      ) : (
        <p className="mt-5 text-sm font-medium text-emerald-700">Your payout account is ready.</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        You can finish outstanding Stripe requirements later. External Stripe review does not block dashboard access after setup.
      </p>

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions
          onBack={onBack}
          onContinue={handleContinue}
          continueLabel={payout.payout_ready || payout.stripe_account_id ? 'Continue' : 'Skip for now & Continue'}
          loading={saving}
        />
      </div>
    </div>
  );
}
