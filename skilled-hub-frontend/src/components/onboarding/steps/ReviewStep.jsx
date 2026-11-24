import React from 'react';
import { ONBOARDING_SECTIONS, statusLabel } from '../onboardingSteps';
import { OnboardingActions } from '../OnboardingShell';

export default function ReviewStep({ progress, onJump, onBack, onFinish, loading, error }) {
  const sections = progress?.sections || {};

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
        You&apos;re almost ready to start working!
      </h1>
      <p className="mt-2 text-slate-600">
        Review your setup summary. You can revisit any section before finishing.
      </p>

      <ul className="mt-6 space-y-3">
        {ONBOARDING_SECTIONS.map((section) => {
          const state = sections[section.key] || {};
          return (
            <li
              key={section.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-slate-900">{section.label}</p>
                <p className="text-sm text-slate-600">{statusLabel(state.status)}</p>
                {state.external_pending ? (
                  <p className="text-xs text-amber-700 mt-0.5">External review in progress — you&apos;re clear to finish setup.</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onJump(section.key)}
                className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Review
              </button>
            </li>
          );
        })}
      </ul>

      {!progress?.can_complete ? (
        <p className="mt-4 text-sm text-amber-700">
          Finish the remaining required actions above before going to your dashboard.
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions
          onBack={onBack}
          onContinue={onFinish}
          continueLabel="Finish Setup & Go to My Dashboard"
          continueDisabled={!progress?.can_complete}
          loading={loading}
        />
      </div>
    </div>
  );
}
