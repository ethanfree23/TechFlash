import React from 'react';

function KpiCard({ label, value, subtext, icon, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 hover:border-slate-300',
    orange: 'border-orange-200 hover:border-orange-300 bg-orange-50/30',
    red: 'border-red-200 hover:border-red-300 bg-red-50/30',
    violet: 'border-violet-200 hover:border-violet-300 bg-violet-50/30',
    blue: 'border-blue-200 hover:border-blue-300 bg-blue-50/30',
  };

  return (
    <div
      className={`rounded-2xl border bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-md ${tones[tone] || tones.slate}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function MessagesKpiRow({ kpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KpiCard
        label="Open Messages"
        value={kpis.openMessages}
        subtext="Needs review"
        tone="orange"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />
      <KpiCard
        label="Problems"
        value={kpis.problems}
        subtext="Requires attention"
        tone="red"
        icon={
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
      <KpiCard
        label="Suggestions"
        value={kpis.suggestions}
        subtext="Product ideas"
        tone="violet"
        icon={
          <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
      />
      <KpiCard
        label="Avg Response Time"
        value={kpis.avgResponseTime}
        subtext="Last 7 days"
        tone="blue"
        icon={
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}
