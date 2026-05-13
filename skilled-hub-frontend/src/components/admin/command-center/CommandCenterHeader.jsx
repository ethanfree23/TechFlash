import React from 'react';
import { Link } from 'react-router-dom';
import { FaBell, FaSearch, FaSyncAlt } from 'react-icons/fa';
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
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Admin Command Center</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl">
              Monitor marketplace health, jobs, users, revenue, and operations. Filters apply to tables and derived metrics loaded from platform insights.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FaSyncAlt className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <FaBell className="text-slate-500" />
              Alerts use rules on loaded data
            </span>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-3 xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {COMMAND_CENTER_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ ...filters, period: p.id })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  filters.period === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Last updated:{' '}
            {lastUpdatedMs ? new Date(lastUpdatedMs).toLocaleString() : '—'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block text-xs font-medium text-slate-600">
            Market
            <select
              value={filters.market}
              onChange={(e) => onChange({ ...filters, market: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {COMMAND_CENTER_MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Trade
            <select
              value={filters.trade}
              onChange={(e) => onChange({ ...filters, trade: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
            <label className="block text-xs font-medium text-slate-600">Search loaded tables</label>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                  placeholder="Job, company, email…"
                />
              </div>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Apply
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/jobs/create"
            className="inline-flex items-center rounded-lg bg-[#FE6711] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 shadow-sm"
          >
            Post job
          </Link>
          <Link to="/crm" className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Add company (CRM)
          </Link>
          <Link to="/admin/users" className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Invite technician
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Export / print
          </button>
        </div>
      </div>
    </div>
  );
}
