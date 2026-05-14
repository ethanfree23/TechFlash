import React from 'react';
import { FaCheck } from 'react-icons/fa';

const STEPS = [
  { label: 'Email', subActive: 'Verify email & password', subDone: 'Completed', subPending: 'Pending' },
  { label: 'Your Information', subActive: 'Tell us about you', subDone: 'Completed', subPending: 'Pending' },
  { label: 'Membership', subActive: 'Choose a plan', subDone: 'Completed', subPending: 'Pending' },
  { label: 'Review & Complete', subActive: 'Confirm and finish', subDone: 'Completed', subPending: 'Pending' },
];

function StepCircle({ done, active, number }) {
  if (done) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white/10 text-white">
        <FaCheck className="h-4 w-4" aria-hidden />
      </div>
    );
  }
  if (active) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tf-orange text-sm font-bold text-white shadow-lg">
        {number}
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/40 bg-transparent text-sm font-semibold text-white/70">
      {number}
    </div>
  );
}

export function SignupProgressStepper({ currentStep }) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex min-w-[640px] items-start justify-between gap-1 px-1 sm:min-w-0 sm:px-2">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = currentStep > n;
          const active = currentStep === n;
          const sub = done ? s.subDone : active ? s.subActive : s.subPending;
          return (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div
                  className={`mx-1 mt-5 hidden h-0.5 flex-1 sm:block ${currentStep > i ? 'bg-white/80' : 'bg-white/25'}`}
                  aria-hidden
                />
              )}
              <div className="flex max-w-[140px] flex-1 flex-col items-center text-center sm:max-w-none">
                <StepCircle done={done} active={active} number={n} />
                <p className={`mt-2 text-xs font-bold sm:text-sm ${active || done ? 'text-white' : 'text-white/60'}`}>
                  {s.label}
                </p>
                <p className={`mt-0.5 text-[10px] leading-tight sm:text-xs ${done ? 'text-emerald-200' : active ? 'text-white/90' : 'text-white/45'}`}>
                  {sub}
                </p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
