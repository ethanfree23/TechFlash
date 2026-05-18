import React from 'react';

const PIPELINE_STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'prospect', 'customer'];

const STAGE_STYLES = {
  lead: {
    active: 'bg-indigo-600 text-white border-indigo-600 shadow-sm',
    done: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  contacted: {
    active: 'bg-sky-600 text-white border-sky-600 shadow-sm',
    done: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  qualified: {
    active: 'bg-teal-600 text-white border-teal-600 shadow-sm',
    done: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  proposal: {
    active: 'bg-violet-600 text-white border-violet-600 shadow-sm',
    done: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  prospect: {
    active: 'bg-amber-500 text-white border-amber-500 shadow-sm',
    done: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  customer: {
    active: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
    done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

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
          const styles = STAGE_STYLES[stage];
          return (
            <React.Fragment key={stage}>
              <div
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold capitalize border ${
                  active ? styles.active : done ? styles.done : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {stage.replace(/_/g, ' ')}
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-slate-300 text-xs px-0.5" aria-hidden>
                  {'\u2192'}
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

