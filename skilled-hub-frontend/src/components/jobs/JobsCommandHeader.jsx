import React from 'react';
import { Link } from 'react-router-dom';
import { FaDownload, FaPlus, FaShare, FaBookmark } from 'react-icons/fa';
import JobsKpiCard from './JobsKpiCard';
import { buildKpiCards } from '../../utils/jobDashboardConfig';

const ROLE_LABELS = {
  admin: { text: 'Operations', className: 'bg-slate-800 text-white' },
  company: { text: 'Company', className: 'bg-blue-600 text-white' },
  technician: { text: 'Technician', className: 'bg-emerald-600 text-white' },
};

export default function JobsCommandHeader({
  config,
  role,
  analytics,
  analyticsLoading = false,
  onExport,
  onKpiClick,
  onReferral,
  onSaveSearch,
  saveSearchBusy,
  savedSearchCount,
}) {
  const kpis = config.showKpis ? buildKpiCards(role, analytics, []) : [];
  const roleBadge = ROLE_LABELS[role];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden mb-6">
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {roleBadge && (
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleBadge.className}`}
                >
                  {roleBadge.text}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{config.title}</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl leading-relaxed">{config.subtitle}</p>
            {config.techNote && (
              <p className="mt-2 text-xs text-slate-500 max-w-2xl leading-relaxed border-l-2 border-orange-300 pl-2.5">
                {config.techNote}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0 lg:pt-1">
            {config.showCreateJob && (
              <Link
                to="/jobs/create"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <FaPlus className="h-3.5 w-3.5" aria-hidden />
                Create Job
              </Link>
            )}
            {config.showExport && (
              <button
                type="button"
                onClick={onExport}
                title="Exports currently filtered jobs. Full server export requires backend integration."
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
              >
                <FaDownload className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                Export
              </button>
            )}
            {config.showReferral && (
              <>
                <button
                  type="button"
                  onClick={onReferral}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                >
                  <FaShare className="h-3.5 w-3.5 text-slate-500" />
                  Referral
                </button>
                <button
                  type="button"
                  onClick={onSaveSearch}
                  disabled={saveSearchBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
                >
                  <FaBookmark className="h-3.5 w-3.5" />
                  {saveSearchBusy ? 'Saving…' : 'Save search'}
                </button>
              </>
            )}
          </div>
        </div>

        {config.showReferral && savedSearchCount > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {savedSearchCount} saved search{savedSearchCount !== 1 ? 'es' : ''} active
          </p>
        )}
      </div>

      {kpis.length > 0 && (
        <div
          className={`px-3 py-3.5 sm:px-5 grid gap-2.5 bg-slate-50/70 border-t border-slate-100 ${
            kpis.length === 5 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
          }`}
        >
          {kpis.map((kpi) => (
            <JobsKpiCard
              key={kpi.id}
              {...kpi}
              value={analyticsLoading && analytics == null ? '…' : kpi.value}
              onClick={
                kpi.id === 'total'
                  ? () => onKpiClick?.('')
                  : kpi.filterStatus
                    ? () => onKpiClick?.(kpi.filterStatus)
                    : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
