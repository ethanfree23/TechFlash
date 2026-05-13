import React from 'react';

const PIPELINE_STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'prospect', 'customer'];

export default function PipelineStageTracker({ currentStatus }) {
  const cur = String(currentStatus || 'lead').toLowerCase();
  const idx = PIPELINE_STAGES.indexOf(cur);
  const activeIdx = idx >= 0 ? idx : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Sales pipeline</h4>
      <div className="flex flex-wrap items-center gap-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <React.Fragment key={stage}>
              <div
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold capitalize border ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : done
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {stage.replace(/_/g, ' ')}
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-slate-300 text-xs px-0.5" aria-hidden>
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {['competitor', 'churned', 'lost'].includes(cur) ? (
        <p className="mt-2 text-xs text-slate-500">
          Terminal status <span className="font-medium capitalize">{cur}</span> — not on the main acquisition path.
        </p>
      ) : null}
    </div>
  );
}
