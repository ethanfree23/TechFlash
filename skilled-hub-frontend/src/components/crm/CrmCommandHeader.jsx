import React from 'react';
import { FaPlus } from 'react-icons/fa';
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
  const runTopAction = (actionId) => {
    if (actionId === 'import') onImport?.();
    if (actionId === 'create-platform') onCreatePlatform?.();
    if (actionId === 'export') onExport?.();
    if (actionId === 'merge') onMerge?.();
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden h-full">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Company CRM</h1>
            <p className="mt-1 text-xs text-slate-600 max-w-xl">
              Manage prospects, company accounts, outreach, jobs, spend, and activation.
            </p>
            {lastUpdatedLabel ? (
              <p className="mt-2 text-xs text-slate-400">Last data refresh: {lastUpdatedLabel}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            <button
              type="button"
              onClick={onAddCompany}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <FaPlus className="h-3.5 w-3.5" aria-hidden />
              Add company
            </button>
            <select
              defaultValue=""
              onChange={(e) => {
                const action = e.target.value;
                if (!action) return;
                runTopAction(action);
                e.target.value = '';
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 min-w-[9.5rem]"
              aria-label="More CRM actions"
            >
              <option value="">More actions…</option>
              <option value="import">Import prospects</option>
              <option value="create-platform">Create platform account</option>
              <option value="export">Export CRM</option>
              <option value="merge">Dedupe / Merge</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 sm:px-5 bg-slate-50/50 border-b border-slate-100">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">Date range</span>
          <select
            value={dateRange}
            onChange={(e) => onDateRange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 min-w-[8rem]"
          >
            {CRM_DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 py-2.5 sm:px-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
        <div className="flex flex-wrap gap-1.5">
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
