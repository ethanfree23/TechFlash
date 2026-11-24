import React from 'react';
import { FaCheckCircle, FaRegCircle } from 'react-icons/fa';
import { ONBOARDING_SECTIONS, statusLabel } from '../onboardingSteps';
import { OnboardingActions } from '../OnboardingShell';

export default function WelcomeStep({ user, progress, onStart, loading }) {
  const firstName = user?.first_name || progress?.user?.first_name || 'there';
  const started = progress?.status === 'in_progress' || (progress?.completed_sections || []).length > 0;
  const percent = progress?.percent || 0;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-tf-orange">TechFlash</p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
        Welcome to TechFlash, {firstName}!
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600 leading-relaxed">
        Let&apos;s get your account ready so you can start finding work and connecting with companies.
      </p>

      {started ? (
        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
          <p className="text-sm font-semibold">You&apos;re {percent}% through setup</p>
          <p className="mt-1 text-sm text-sky-900/80">
            Pick up where you left off — we saved your progress.
          </p>
        </div>
      ) : null}

      <ol className="mt-8 space-y-3">
        {ONBOARDING_SECTIONS.map((section, index) => {
          const sectionState = progress?.sections?.[section.key];
          const done = sectionState?.technician_complete || (progress?.completed_sections || []).includes(section.key);
          return (
            <li
              key={section.key}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
            >
              <span className="mt-0.5 text-tf-orange">
                {done ? <FaCheckCircle className="h-5 w-5" /> : <FaRegCircle className="h-5 w-5 text-slate-300" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">
                    {index + 1}. {section.label}
                  </p>
                  {sectionState?.status ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                      {statusLabel(sectionState.status)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{section.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8">
        <OnboardingActions
          onContinue={onStart}
          continueLabel={started ? 'Resume Setup' : "Let's Get Started"}
          loading={loading}
        />
      </div>
    </div>
  );
}
