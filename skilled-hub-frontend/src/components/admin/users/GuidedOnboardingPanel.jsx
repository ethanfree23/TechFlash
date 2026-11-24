import React, { useState } from 'react';
import { adminTechnicianOnboardingAPI } from '../../../api/technicianOnboardingApi';
import { ONBOARDING_SECTIONS, statusLabel } from '../../onboarding/onboardingSteps';

export default function GuidedOnboardingPanel({ userId, guidedOnboarding, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRequire, setConfirmRequire] = useState(false);

  if (!guidedOnboarding) return null;

  const requireAgain = async () => {
    if (!confirmRequire) {
      setConfirmRequire(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await adminTechnicianOnboardingAPI.requireOnboarding(userId);
      onUpdated?.(res?.onboarding);
      setConfirmRequire(false);
    } catch (e) {
      setError(e.message || 'Could not require onboarding.');
    } finally {
      setBusy(false);
    }
  };

  const sections = guidedOnboarding.sections || {};

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Guided onboarding</h3>
          <p className="mt-1 text-xs text-slate-500">
            Wizard status for the technician-facing account setup experience.
          </p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p className="font-semibold capitalize">{guidedOnboarding.status || '—'}</p>
          <p>{guidedOnboarding.percent != null ? `${guidedOnboarding.percent}%` : '—'}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="text-slate-400">Current section</dt>
          <dd className="font-medium text-slate-800">{guidedOnboarding.current_section || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Last activity</dt>
          <dd className="font-medium text-slate-800">
            {guidedOnboarding.last_activity_at
              ? new Date(guidedOnboarding.last_activity_at).toLocaleString()
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Completed</dt>
          <dd className="font-medium text-slate-800">
            {guidedOnboarding.completed_at
              ? new Date(guidedOnboarding.completed_at).toLocaleDateString()
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Assessment</dt>
          <dd className="font-medium text-slate-800">
            {guidedOnboarding.assessments?.incomplete_count > 0
              ? `${guidedOnboarding.assessments.incomplete_count} outstanding`
              : guidedOnboarding.assessments?.available
                ? 'Complete / none due'
                : 'N/A'}
          </dd>
        </div>
      </dl>

      <ul className="space-y-1.5">
        {ONBOARDING_SECTIONS.map((section) => {
          const state = sections[section.key] || {};
          return (
            <li key={section.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">{section.label}</span>
              <span className="text-xs font-semibold text-slate-500">{statusLabel(state.status)}</span>
            </li>
          );
        })}
      </ul>

      {guidedOnboarding.grandfathered ? (
        <p className="text-xs text-slate-500">
          Grandfathered established account{guidedOnboarding.grandfather_reason ? `: ${guidedOnboarding.grandfather_reason}` : ''}.
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={requireAgain}
        className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
      >
        {confirmRequire
          ? 'Confirm: require onboarding again (keeps profile data)'
          : 'Require onboarding again'}
      </button>
    </section>
  );
}
