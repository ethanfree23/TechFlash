import React from 'react';
import StatusBadge from './StatusBadge';

export default function MarketplaceHealthCard({ health }) {
  if (!health) return null;
  const badge =
    health.status === 'Healthy' ? 'success' : health.status === 'Critical' ? 'danger' : 'warning';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5 flex flex-col min-h-[22rem]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Marketplace health</h2>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-semibold text-slate-900 tabular-nums leading-none">{health.score}</span>
            <StatusBadge variant={badge}>{health.status}</StatusBadge>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500 leading-snug max-w-prose">
            Composite index from fill rate, stale opens without applicants, and 30-day job/application slopes (see adapter).
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2 flex-1">
        {(health.bars || []).map((b) => (
          <div key={b.label}>
            <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
              <span className="truncate pr-2">{b.label}</span>
              <span className="tabular-nums font-medium shrink-0">{b.value}</span>
            </div>
            <div className="h-1.5 rounded-sm bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-sm bg-slate-800"
                style={{ width: `${Math.min(100, b.value)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs text-slate-700">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Signals</p>
          <ul className="space-y-1 text-[10px] leading-snug text-slate-600">
            {(health.insights || []).map((t, i) => (
              <li key={i} className="pl-2 border-l-2 border-slate-300">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Recommended actions</p>
          <ul className="space-y-1 text-[10px] leading-snug text-slate-700">
            {(health.actions || []).map((t, i) => (
              <li key={i} className="pl-2 border-l-2 border-slate-400">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
