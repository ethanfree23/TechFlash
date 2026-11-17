import React from 'react';
import { Link } from 'react-router-dom';

export default function OnboardingReadinessChecklist({ onboarding, onEditProfile }) {
  if (!onboarding) {
    return <p className="text-[11px] text-slate-400">Onboarding checklist unavailable.</p>;
  }

  const items = Array.isArray(onboarding.items) ? onboarding.items : [];
  const blockers = items.filter((item) => !item.done && !item.optional);
  const percent = onboarding.percent ?? 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-slate-600">{percent}% ready</span>
        <span className="text-[10px] text-slate-400">
          {blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : 'No blockers'}
        </span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${percent >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className={`flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 ${
              item.done
                ? 'border-emerald-100 bg-emerald-50/50'
                : item.optional
                  ? 'border-slate-100 bg-slate-50/60'
                  : 'border-amber-100 bg-amber-50/70'
            }`}
          >
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold ${item.done ? 'text-emerald-800' : 'text-slate-800'}`}>
                {item.done ? '✓ ' : !item.optional ? '! ' : ''}
                {item.label}
                {item.optional ? ' (optional)' : ''}
              </p>
              {item.detail && <p className="text-[10px] text-slate-500 truncate">{item.detail}</p>}
            </div>
            {!item.done && (
              item.key === 'profile' || item.key === 'trade_license' || item.key === 'payout_setup' ? (
                <button
                  type="button"
                  onClick={onEditProfile}
                  className="shrink-0 text-[10px] font-semibold text-tf-blue hover:underline"
                >
                  Fix
                </button>
              ) : item.href ? (
                <Link to={item.href} className="shrink-0 text-[10px] font-semibold text-tf-blue hover:underline">
                  Open
                </Link>
              ) : null
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
