import React from 'react';
import Sparkline from './Sparkline';

const toneColors = {
  blue: '#1e40af',
  orange: '#c2410c',
  teal: '#0f766e',
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
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 min-h-[5.25rem] flex flex-col">
      <div className="flex items-start justify-between gap-2 flex-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 truncate">{formatVal(value, format)}</p>
          {delta != null && (
            <p className={`mt-0.5 text-[10px] font-medium ${delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {delta >= 0 ? '+' : ''}
              {delta}% vs prior
            </p>
          )}
          {footnote && (
            <p className="mt-1 text-[10px] leading-snug text-slate-500 line-clamp-2" title={footnote}>
              {footnote}
            </p>
          )}
        </div>
        <div className="shrink-0 pt-0.5">
          <Sparkline data={spark} color={c} />
        </div>
      </div>
    </div>
  );
}
