import React from 'react';

export default function MarketplaceFunnel({ funnel }) {
  if (!funnel?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
        No funnel data
      </div>
    );
  }
  const max = Math.max(...funnel.map((f) => Number(f.count) || 0), 1);
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm lg:col-span-7">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marketplace funnel</h2>
      <p className="text-xs text-slate-500 mt-1 mb-4">
        Stage counts mix all-time accounts with window-scoped applications where noted. Percent shows rough ratio to prior stage.
      </p>
      <div className="space-y-2">
        {funnel.map((stage, idx) => {
          const w = 40 + (Number(stage.count) / max) * 55;
          const prev = idx > 0 ? funnel[idx - 1].count : null;
          const drop =
            prev != null && prev > 0 && stage.count != null ? Math.round((1 - stage.count / prev) * 100) : null;
          const badDrop = drop != null && drop > 40;
          return (
            <div key={stage.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-medium text-slate-800 transition-all ${
                  badDrop ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
                }`}
                style={{ width: `${w}%`, minWidth: '12rem' }}
              >
                <div className="flex justify-between gap-2">
                  <span>{stage.label}</span>
                  <span className="tabular-nums font-bold">{stage.count ?? '—'}</span>
                </div>
                {stage.pctFromPrev != null && (
                  <p className="text-[11px] text-slate-500 mt-1">{stage.pctFromPrev}% of prior stage width (approx.)</p>
                )}
                {drop != null && (
                  <p className={`text-[11px] mt-0.5 ${badDrop ? 'text-amber-800 font-medium' : 'text-slate-500'}`}>
                    Step drop-off vs prior: {drop}%
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
