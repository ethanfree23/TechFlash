import React from 'react';
import {
  FaPlus,
  FaFileUpload,
  FaUserPlus,
  FaDownload,
  FaObjectGroup,
} from 'react-icons/fa';
import {
  CRM_DATE_RANGE_OPTIONS,
  CRM_MARKET_FILTERS,
  CRM_TRADE_FILTER_OPTIONS,
} from '../../utils/crmConstants';

function StatChip({ label, value, muted }) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 min-w-[4.5rem] ${muted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white shadow-sm'}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{label}</div>
      <div className="text-sm font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export default function CrmCommandHeader({
  stats,
  dateRange,
  onDateRange,
  market,
  onMarket,
  trade,
  onTrade,
  lastUpdatedLabel,
  onImport,
  onAddCompany,
  onCreatePlatform,
  onMerge,
  onExport,
}) {
  const s = stats || {};
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mb-6">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Company CRM</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Manage prospects, company accounts, outreach, jobs, spend, and activation.
            </p>
            {lastUpdatedLabel ? (
              <p className="mt-2 text-xs text-slate-400">Last data refresh: {lastUpdatedLabel}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onAddCompany}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <FaPlus className="h-4 w-4" aria-hidden />
              Add company
            </button>
            <button
              type="button"
              onClick={onImport}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
            >
              <FaFileUpload className="h-4 w-4" aria-hidden />
              Import prospects
            </button>
            <button
              type="button"
              onClick={onCreatePlatform}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <FaUserPlus className="h-4 w-4" aria-hidden />
              Create platform account
            </button>
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FaDownload className="h-4 w-4 text-slate-500" aria-hidden />
              Export CRM
            </button>
            <button
              type="button"
              onClick={onMerge}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-50"
            >
              <FaObjectGroup className="h-4 w-4" aria-hidden />
              Dedupe / Merge
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 sm:px-6 bg-slate-50/50">
        <div className="flex flex-wrap gap-2 items-center">
          {CRM_DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onDateRange(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                dateRange === opt.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 sm:px-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between border-b border-slate-100">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Market</span>
          <select
            value={market}
            onChange={(e) => onMarket(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 min-w-[8rem]"
          >
            {CRM_MARKET_FILTERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0 ml-2">Trade</span>
          <select
            value={trade}
            onChange={(e) => onTrade(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 min-w-[9rem]"
          >
            {CRM_TRADE_FILTER_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip label="Total" value={s.totalProspects ?? '—'} />
          <StatChip label="New leads" value={s.newLeads ?? '—'} />
          <StatChip label="Contacted" value={s.contacted ?? '—'} />
          <StatChip label="Qualified+" value={s.qualified ?? '—'} />
          <StatChip label="In view" value={s.filteredCount ?? '—'} />
          <StatChip label="Stale" value={s.staleLeads ?? '—'} />
          <StatChip label="Unlinked" value={s.unlinkedRecords ?? '—'} />
        </div>
      </div>
    </div>
  );
}
