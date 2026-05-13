import React from 'react';
import Sparkline from './Sparkline';

const toneColors = {
  blue: '#2563eb',
  orange: '#ea580c',
  teal: '#0d9488',
};

function formatVal(k, format) {
  if (k == null) return '—';
  if (format === 'cents') {
    const n = Number(k) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
  }
  if (typeof k === 'number') return k.toLocaleString();
  return String(k);
}

export default function KpiCard({ label, value, delta, spark, tone = 'blue', footnote, format }) {
  const c = toneColors[tone] || toneColors.blue;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 truncate">{formatVal(value, format)}</p>
          {delta != null && (
            <p className={`mt-1 text-xs font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {delta >= 0 ? '+' : ''}
              {delta}% vs prior
            </p>
          )}
          {delta == null && <p className="mt-1 text-xs text-slate-400">Delta: —</p>}
          {footnote && <p className="mt-2 text-[11px] leading-snug text-slate-500">{footnote}</p>}
        </div>
        <Sparkline data={spark} color={c} />
      </div>
    </div>
  );
}
