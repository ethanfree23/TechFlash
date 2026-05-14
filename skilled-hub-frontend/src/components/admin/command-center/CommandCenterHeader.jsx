import React from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaSyncAlt } from 'react-icons/fa';
import { COMMAND_CENTER_MARKETS, COMMAND_CENTER_PERIODS, COMMAND_CENTER_TRADES } from '../../../data/adminCommandCenterAdapter';

export default function CommandCenterHeader({
  filters,
  onChange,
  lastUpdatedMs,
  onRefresh,
  refreshing,
  onSearchSubmit,
}) {
  const [localSearch, setLocalSearch] = React.useState(filters.search || '');

  React.useEffect(() => {
    setLocalSearch(filters.search || '');
  }, [filters.search]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">Command center</h1>
            <p className="mt-0.5 text-xs text-slate-600 max-w-3xl leading-relaxed">
              Operations view for marketplace liquidity, verification, company activation, and revenue signals. Filters apply to
              loaded platform insight slices.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FaSyncAlt className={refreshing ? 'animate-spin text-[10px]' : 'text-[10px]'} />
              Refresh
            </button>
            <span className="text-[10px] text-slate-500 tabular-nums">
              Updated {lastUpdatedMs ? new Date(lastUpdatedMs).toLocaleString() : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {COMMAND_CENTER_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ ...filters, period: p.id })}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold border ${
                filters.period === p.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="block text-[10px] font-medium text-slate-600">
            Market
            <select
              value={filters.market}
              onChange={(e) => onChange({ ...filters, market: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            >
              {COMMAND_CENTER_MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-medium text-slate-600">
            Trade
            <select
              value={filters.trade}
              onChange={(e) => onChange({ ...filters, trade: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            >
              {COMMAND_CENTER_TRADES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <form
            className="sm:col-span-2 lg:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...filters, search: localSearch });
              onSearchSubmit?.(localSearch);
            }}
          >
            <label className="block text-[10px] font-medium text-slate-600">Search loaded rows</label>
            <div className="mt-0.5 flex gap-1.5">
              <div className="relative flex-1">
                <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
                <input
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-1.5 pl-7 pr-2 text-xs"
                  placeholder="Job, company, email…"
                />
              </div>
              <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                Apply
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          <Link
            to="/jobs/create"
            className="inline-flex items-center rounded-md bg-[#FE6711] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            Post job
          </Link>
          <Link
            to="/crm"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            CRM
          </Link>
          <Link
            to="/admin/users"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Users
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
