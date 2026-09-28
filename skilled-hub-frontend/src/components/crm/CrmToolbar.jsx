import React, { useEffect, useRef } from 'react';
import { FaCog, FaDownload, FaFilter, FaSearch } from 'react-icons/fa';
import {
  CRM_DATE_RANGE_OPTIONS,
  CRM_MARKET_FILTERS,
  CRM_SORT_OPTIONS,
  CRM_STATUSES,
  CRM_TRADE_FILTER_OPTIONS,
} from '../../utils/crmConstants';

const controlClass =
  'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm focus:border-tf-blue/40 focus:outline-none focus:ring-2 focus:ring-tf-blue/20';

function statusLabel(status) {
  const s = String(status || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-tf-blue/30 ${
        active
          ? 'border-tf-blue/40 bg-sky-50 text-slate-900'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

export default function CrmToolbar({
  search,
  onSearch,
  market,
  onMarket,
  trade,
  onTrade,
  status,
  onStatus,
  sort,
  onSort,
  dateRange,
  onDateRange,
  linkedFilter,
  onLinkedFilter,
  hasNotes,
  onHasNotes,
  hasContact,
  onHasContact,
  hasPhone,
  onHasPhone,
  hasEmail,
  onHasEmail,
  needsFollowup,
  onNeedsFollowup,
  filtersOpen,
  onFiltersOpenChange,
  secondaryFilterCount,
  onExport,
  columnsOpen,
  onColumnsOpenChange,
  columns,
  draggingColumnKey,
  onDraggingColumnKey,
  onToggleColumn,
  onMoveColumn,
}) {
  const filtersRef = useRef(null);
  const columnsRef = useRef(null);

  useEffect(() => {
    if (!filtersOpen && !columnsOpen) return undefined;
    const onDoc = (e) => {
      if (filtersOpen && filtersRef.current && !filtersRef.current.contains(e.target)) onFiltersOpenChange?.(false);
      if (columnsOpen && columnsRef.current && !columnsRef.current.contains(e.target)) onColumnsOpenChange?.(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      onFiltersOpenChange?.(false);
      onColumnsOpenChange?.(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen, columnsOpen, onFiltersOpenChange, onColumnsOpenChange]);

  return (
    <div className="mb-2 flex flex-col gap-2">
        <label className="relative block w-full">
          <span className="sr-only">Search companies</span>
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder="Search companies, contacts, email, phone, city, trade..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-tf-blue/50 focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative" ref={filtersRef}>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-haspopup="dialog"
              onClick={() => {
                onColumnsOpenChange?.(false);
                onFiltersOpenChange?.(!filtersOpen);
              }}
              className={`${controlClass} inline-flex items-center gap-1.5`}
            >
              <FaFilter className="h-3 w-3 text-slate-500" aria-hidden />
              Filters
              {secondaryFilterCount > 0 ? (
                <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-tf-blue px-1 text-[10px] font-bold text-white">
                  {secondaryFilterCount}
                </span>
              ) : null}
            </button>
            {filtersOpen ? (
              <div
                role="dialog"
                aria-label="More filters"
                className="absolute left-0 top-full z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">More filters</div>
                <label className="mt-2 block text-[11px] font-medium text-slate-600">
                  Date range
                  <select value={dateRange} onChange={(e) => onDateRange?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                    {CRM_DATE_RANGE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="block text-[11px] font-medium text-slate-600">
                    Linked
                    <select value={linkedFilter} onChange={(e) => onLinkedFilter?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                      <option value="all">Any</option>
                      <option value="linked">Linked only</option>
                      <option value="unlinked">Unlinked only</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Notes
                    <select value={hasNotes} onChange={(e) => onHasNotes?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                      <option value="all">Any</option>
                      <option value="yes">Has notes</option>
                      <option value="no">No notes</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Contact
                    <select value={hasContact} onChange={(e) => onHasContact?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                      <option value="all">Any</option>
                      <option value="yes">Has contact</option>
                      <option value="no">Missing contact</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Phone
                    <select value={hasPhone} onChange={(e) => onHasPhone?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                      <option value="all">Any</option>
                      <option value="yes">Has phone</option>
                      <option value="no">Missing phone</option>
                    </select>
                  </label>
                  <label className="col-span-2 block text-[11px] font-medium text-slate-600">
                    Email
                    <select value={hasEmail} onChange={(e) => onHasEmail?.(e.target.value)} className={`${controlClass} mt-1 w-full`}>
                      <option value="all">Any</option>
                      <option value="yes">Has email</option>
                      <option value="no">Missing email</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <ToggleChip active={hasPhone === 'no'} onClick={() => onHasPhone?.(hasPhone === 'no' ? 'all' : 'no')}>
                    Missing phone
                  </ToggleChip>
                  <ToggleChip active={hasEmail === 'no'} onClick={() => onHasEmail?.(hasEmail === 'no' ? 'all' : 'no')}>
                    Missing email
                  </ToggleChip>
                  <ToggleChip active={linkedFilter === 'unlinked'} onClick={() => onLinkedFilter?.(linkedFilter === 'unlinked' ? 'all' : 'unlinked')}>
                    Unlinked
                  </ToggleChip>
                  <ToggleChip active={needsFollowup} onClick={() => onNeedsFollowup?.(!needsFollowup)}>
                    Needs follow-up
                  </ToggleChip>
                </div>
              </div>
            ) : null}
          </div>
          <select aria-label="Market" value={market} onChange={(e) => onMarket?.(e.target.value)} className={`${controlClass} min-w-[8.5rem]`}>
            {CRM_MARKET_FILTERS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <select aria-label="Trade" value={trade} onChange={(e) => onTrade?.(e.target.value)} className={`${controlClass} min-w-[8.5rem]`}>
            {CRM_TRADE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => onStatus?.(e.target.value)} className={`${controlClass} min-w-[7.5rem] capitalize`}>
            <option value="">Status</option>
            {CRM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
        <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <span className="sr-only">Sort companies</span>
          <span aria-hidden>Sort</span>
          <select value={sort} onChange={(e) => onSort?.(e.target.value)} className={`${controlClass} min-w-[10.5rem]`}>
            {CRM_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="relative" ref={columnsRef}>
          <button
            type="button"
            aria-expanded={columnsOpen}
            onClick={() => {
              onFiltersOpenChange?.(false);
              onColumnsOpenChange?.(!columnsOpen);
            }}
            className={`${controlClass} inline-flex items-center gap-1.5`}
          >
            <FaCog className="h-3 w-3 text-slate-500" aria-hidden />
            Columns
          </button>
          {columnsOpen ? (
            <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <p className="mb-2 text-[11px] text-slate-500">Show, hide, and drag to reorder columns. Company stays pinned.</p>
              <ul className="max-h-64 space-y-1.5 overflow-auto">
                {(columns || []).map((col) => (
                  <li
                    key={col.key}
                    draggable
                    onDragStart={() => onDraggingColumnKey?.(col.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      onMoveColumn?.(draggingColumnKey, col.key);
                      onDraggingColumnKey?.(null);
                    }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input type="checkbox" checked={col.visible !== false} onChange={() => onToggleColumn?.(col.key)} />
                      <span>{col.label}</span>
                    </label>
                    <span className="text-[10px] text-slate-400">drag</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onExport} className={`${controlClass} inline-flex items-center gap-1.5`}>
          <FaDownload className="h-3 w-3 text-slate-500" aria-hidden />
          Export
        </button>
      </div>
      </div>
    </div>
  );
}
