import React from 'react';

const METRICS = [
  { id: 'total', label: 'Total', statKey: 'totalProspects', hint: 'All companies in the current market, trade, and date range' },
  { id: 'lead', label: 'New leads', statKey: 'newLeads', hint: 'Status is lead' },
  { id: 'contacted', label: 'Contacted', statKey: 'contacted', hint: 'Status is contacted' },
  { id: 'qualified', label: 'Qualified', statKey: 'qualified', hint: 'Qualified, proposal, and prospect' },
  { id: 'stale', label: 'Stale', statKey: 'staleLeads', hint: 'Open pipeline records with no update in 30 days' },
  { id: 'unlinked', label: 'Unlinked', statKey: 'unlinkedRecords', hint: 'Not linked to a TechFlash company account' },
];

export default function CrmMetrics({ stats, activeIds, onSelect }) {
  const s = stats || {};
  const activeSet = new Set(Array.isArray(activeIds) ? activeIds : []);
  return (
    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="Pipeline summary">
      {METRICS.map((metric) => {
        const active = activeSet.has(metric.id);
        const value = s[metric.statKey];
        return (
          <button
            key={metric.id}
            type="button"
            title={metric.hint}
            aria-pressed={active}
            onClick={() => onSelect?.(metric.id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tf-blue/30 ${
              active
                ? 'border-tf-blue/40 bg-sky-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{metric.label}</div>
            <div className="mt-0.5 text-lg font-semibold leading-none tabular-nums text-slate-900">
              {value ?? '—'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
