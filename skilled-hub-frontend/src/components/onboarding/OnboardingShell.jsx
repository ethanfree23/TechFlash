import React from 'react';
import { FaArrowLeft, FaCheck } from 'react-icons/fa';
import { TECHFLASH_LOGO_NAV } from '../../constants/branding';
import { ONBOARDING_SECTIONS } from './onboardingSteps';

function ProgressRail({ activeKey, completedSections, sectionStatuses, onJump }) {
  return (
    <nav aria-label="Onboarding progress" className="hidden lg:flex w-64 shrink-0 flex-col gap-1 pr-2">
      {ONBOARDING_SECTIONS.map((section, index) => {
        const done = completedSections.includes(section.key) || sectionStatuses?.[section.key]?.technician_complete;
        const active = activeKey === section.key;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onJump?.(section.key)}
            className={`flex items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
              active
                ? 'bg-white/15 text-white'
                : done
                  ? 'text-white/90 hover:bg-white/10'
                  : 'text-white/55 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? 'bg-emerald-400 text-emerald-950'
                  : active
                    ? 'bg-tf-orange text-white'
                    : 'border border-white/30 text-white/70'
              }`}
            >
              {done ? <FaCheck className="h-3 w-3" aria-hidden /> : index + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold">{section.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-white/60">{section.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileProgress({ activeKey, completedSections }) {
  const idx = Math.max(0, ONBOARDING_SECTIONS.findIndex((s) => s.key === activeKey));
  const percent = Math.round(((completedSections.length) / ONBOARDING_SECTIONS.length) * 100);
  return (
    <div className="lg:hidden mb-4">
      <div className="flex items-center justify-between text-xs text-white/80 mb-2">
        <span>
          Step {Math.min(idx + 1, ONBOARDING_SECTIONS.length)} of {ONBOARDING_SECTIONS.length}
        </span>
        <span>{percent}% complete</span>
      </div>
      <div className="h-2 rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-tf-orange transition-all duration-500"
          style={{ width: `${Math.max(8, percent)}%` }}
        />
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {ONBOARDING_SECTIONS.map((section) => {
          const done = completedSections.includes(section.key);
          const active = activeKey === section.key;
          return (
            <span
              key={section.key}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                active ? 'bg-tf-orange text-white' : done ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
              }`}
            >
              {section.short}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function OnboardingShell({
  user,
  activeKey = 'welcome',
  completedSections = [],
  sectionStatuses = {},
  onJump,
  onExit,
  children,
  footer,
  title,
  subtitle,
}) {
  const showRail = activeKey !== 'welcome' && activeKey !== 'review';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 10% -10%, rgba(254,103,17,0.28), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(58,124,165,0.35), transparent 50%), linear-gradient(180deg, #0b1220 0%, #0f172a 45%, #111827 100%)',
        }}
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 w-auto brightness-0 invert" />
            <div className="min-w-0 hidden sm:block">
              <p className="text-sm font-semibold text-white truncate">Account setup</p>
              <p className="text-xs text-white/60 truncate">
                {user?.first_name ? `Hi ${user.first_name}` : 'Technician onboarding'}
              </p>
            </div>
          </div>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
            >
              <FaArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Save & exit
            </button>
          ) : null}
        </header>

        <div className={`flex flex-1 gap-8 ${showRail ? '' : 'justify-center'}`}>
          {showRail ? (
            <ProgressRail
              activeKey={activeKey}
              completedSections={completedSections}
              sectionStatuses={sectionStatuses}
              onJump={onJump}
            />
          ) : null}

          <main className="flex min-w-0 flex-1 flex-col">
            {showRail ? (
              <MobileProgress activeKey={activeKey} completedSections={completedSections} />
            ) : null}

            <div className="flex-1 rounded-3xl border border-white/10 bg-white text-slate-900 shadow-2xl shadow-black/30">
              <div className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
                {title ? (
                  <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
                    {subtitle ? <p className="mt-2 text-base text-slate-600 leading-relaxed">{subtitle}</p> : null}
                  </div>
                ) : null}
                {children}
              </div>
              {footer ? (
                <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur px-5 py-4 sm:px-8 lg:px-10 rounded-b-3xl">
                  {footer}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function OnboardingActions({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  backLabel = 'Back',
  continueDisabled = false,
  loading = false,
  secondary,
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        {secondary}
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled || loading}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-tf-orange px-6 text-sm font-bold text-white shadow-lg shadow-orange-500/25 hover:bg-tf-orange-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Saving…' : continueLabel}
      </button>
    </div>
  );
}
