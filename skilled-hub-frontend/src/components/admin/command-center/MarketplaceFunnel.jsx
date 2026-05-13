import React from 'react';

export default function MarketplaceFunnel({ funnel }) {
  if (!funnel?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
        No funnel data for this view
      </div>
    );
  }
  const max = Math.max(...funnel.map((f) => Number(f.count) || 0), 1);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7 flex flex-col min-h-[22rem]">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lifecycle funnel</h2>
      <p className="text-[10px] text-slate-500 mt-0.5 mb-3 leading-snug">
        Account totals are all-time from analytics; applicant and payout steps use the insights window where labeled. Step drop compares consecutive stages.
      </p>
      <div className="space-y-1.5 flex-1">
        {funnel.map((stage, idx) => {
          const w = 42 + (Number(stage.count) / max) * 52;
          const prev = idx > 0 ? funnel[idx - 1].count : null;
          const drop =
            prev != null && prev > 0 && stage.count != null ? Math.round((1 - stage.count / prev) * 100) : null;
          const badDrop = drop != null && drop > 40;
          return (
            <div key={stage.key} className="flex flex-col sm:flex-row sm:items-stretch gap-1.5">
              <div
                className={`rounded-md border px-2.5 py-1.5 text-xs text-slate-800 ${
                  badDrop ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200 bg-slate-50'
                }`}
                style={{ width: `${w}%`, minWidth: '11rem' }}
              >
                <div className="flex justify-between gap-2">
                  <span className="leading-snug">{stage.label}</span>
                  <span className="tabular-nums font-semibold shrink-0">{stage.count ?? '—'}</span>
                </div>
                {stage.pctFromPrev != null && (
                  <p className="text-[10px] text-slate-500 mt-0.5">{stage.pctFromPrev}% of prior stage (approx.)</p>
                )}
                {drop != null && (
                  <p className={`text-[10px] mt-0.5 ${badDrop ? 'text-amber-900 font-medium' : 'text-slate-500'}`}>
                    Drop vs prior: {drop}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
