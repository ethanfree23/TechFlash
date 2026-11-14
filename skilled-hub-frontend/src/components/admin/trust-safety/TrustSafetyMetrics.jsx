import React from 'react';

const METRICS = [
  { key: 'needs_review', label: 'Needs Review', tone: 'orange' },
  { key: 'background_checks_pending', label: 'Background Checks Pending', tone: 'blue' },
  { key: 'credentials_awaiting_review', label: 'Credentials Awaiting Review', tone: 'blue' },
  { key: 'references_awaiting_review', label: 'References Awaiting Review', tone: 'blue' },
  { key: 'flagged', label: 'Flagged / Requires Attention', tone: 'red' },
  { key: 'verified_technicians', label: 'Verified Technicians', tone: 'green' },
  { key: 'expiring_credentials', label: 'Expiring Credentials', tone: 'amber' },
];

const TONE = {
  orange: { value: 'text-orange-700', ring: 'ring-orange-300', dot: 'bg-orange-500' },
  blue: { value: 'text-slate-900', ring: 'ring-tf-blue/60', dot: 'bg-tf-blue' },
  red: { value: 'text-red-700', ring: 'ring-red-300', dot: 'bg-red-500' },
  green: { value: 'text-emerald-700', ring: 'ring-emerald-300', dot: 'bg-emerald-500' },
  amber: { value: 'text-amber-800', ring: 'ring-amber-300', dot: 'bg-amber-500' },
};

export default function TrustSafetyMetrics({ summary, loading, activeKey, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5" role="group" aria-label="Trust & Safety metrics">
      {METRICS.map((metric) => {
        const data = summary?.[metric.key];
        const tone = TONE[metric.tone];
        const active = activeKey === metric.key;
        const value = data?.value;
        return (
          <button
            key={metric.key}
            type="button"
            onClick={() => data?.filter && onSelect?.(metric.key, data.filter)}
            aria-pressed={active}
            className={`group text-left rounded-xl border bg-white px-3 py-2.5 min-h-[5.25rem] flex flex-col transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 ${tone.ring} ${
              active ? `border-transparent ring-2 ${tone.ring} shadow-sm` : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{metric.label}</p>
            </div>
            {loading && value == null ? (
              <div className="mt-2 h-6 w-12 rounded bg-slate-100 animate-pulse" />
            ) : (
              <p className={`mt-1 text-xl font-semibold tabular-nums ${value > 0 ? tone.value : 'text-slate-900'}`}>
                {value == null ? '—' : Number(value).toLocaleString()}
              </p>
            )}
            {data?.footnote && (
              <p className="mt-auto pt-1 text-[10px] leading-snug text-slate-500 line-clamp-2" title={data.footnote}>
                {data.footnote}
              </p>
            )}
            {!data?.footnote && data?.breakdown && (
              <p className="mt-auto pt-1 text-[10px] leading-snug text-slate-500 truncate">
                {Object.entries(data.breakdown)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
                  .join(' · ') || 'Nothing waiting'}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
