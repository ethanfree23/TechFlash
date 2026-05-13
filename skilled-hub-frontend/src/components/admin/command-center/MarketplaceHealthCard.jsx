import React from 'react';
import StatusBadge from './StatusBadge';

export default function MarketplaceHealthCard({ health }) {
  if (!health) return null;
  const badge =
    health.status === 'Healthy' ? 'success' : health.status === 'Critical' ? 'danger' : 'warning';
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm lg:col-span-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marketplace health</h2>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold text-slate-900 tabular-nums">{health.score}</span>
            <StatusBadge variant={badge}>{health.status}</StatusBadge>
          </div>
          <p className="mt-2 text-xs text-slate-500">Heuristic score from fill rate, stale listings, and 30-day activity slopes (see adapter).</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {(health.bars || []).map((b) => (
          <div key={b.label}>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>{b.label}</span>
              <span className="tabular-nums font-medium">{b.value}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-[#FE6711]" style={{ width: `${Math.min(100, b.value)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm text-slate-700">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Signals</p>
          <ul className="list-disc pl-4 space-y-1 text-xs leading-relaxed">
            {(health.insights || []).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3">
          <p className="text-xs font-semibold text-blue-800 uppercase mb-2">Recommended actions</p>
          <ul className="list-disc pl-4 space-y-1 text-xs leading-relaxed text-blue-950">
            {(health.actions || []).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
