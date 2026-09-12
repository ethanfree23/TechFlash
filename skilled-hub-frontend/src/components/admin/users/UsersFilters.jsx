import React, { useState, useRef, useEffect } from 'react';
import { FaCog, FaFilter, FaSearch, FaTimes } from 'react-icons/fa';
import { getFilterChips } from '../../../utils/adminUsersDisplayAdapter';
import {
  TABLE_COL_MAX_WIDTH,
  clampTableColumnWidth,
  minWidthForColumnKey,
} from '../../../utils/tableColumnPrefs';

const SAVED_VIEWS_KEY = 'admin_users_saved_views';

const FILTER_FIELDS = [
  { key: 'userType', label: 'User type', type: 'select', options: ['', 'technician', 'company'] },
  { key: 'status', label: 'Status', type: 'select', options: ['', 'Active', 'Invited', 'Incomplete profile'] },
  { key: 'verificationStatus', label: 'Verification', type: 'select', options: ['', 'Verified', 'Pending'] },
  { key: 'riskLevel', label: 'Risk level', type: 'select', options: ['', 'Low', 'Medium', 'High'] },
  { key: 'loginActivity', label: 'Login activity', type: 'select', options: ['', 'active_30d', 'inactive_30d'] },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'trade', label: 'Trade / specialty', type: 'text' },
  { key: 'tradeLevel', label: 'Trade level', type: 'select', options: ['', 'helper', 'apprentice', 'journeyman', 'master'] },
  { key: 'minExperienceYears', label: 'Years (min)', type: 'select', options: ['', '1', '2', '3', '5', '8', '10', '15'] },
  { key: 'subscriptionTier', label: 'Tier status', type: 'select', options: ['', 'trial', 'past_due'], disabledNote: 'Best-effort — detail data may be required' },
  { key: 'hasAcceptedJob', label: 'Has accepted job', type: 'select', options: ['', 'yes', 'no'], disabledNote: 'Approximate until index exposes job counts' },
];

const fieldClass =
  'w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-tf-blue/20 focus:border-tf-blue/40';

function optionLabel(opt) {
  const map = {
    '': 'Any',
    active_30d: 'Logged in last 30 days',
    inactive_30d: 'Inactive 30+ days',
    technician: 'Technician',
    company: 'Company',
    yes: 'Yes',
    no: 'No',
    trial: 'Trial',
    past_due: 'Past due',
    helper: 'Helper',
    apprentice: 'Apprentice',
    journeyman: 'Journeyman',
    master: 'Master',
    1: '1+ years',
    2: '2+ years',
    3: '3+ years',
    5: '5+ years',
    8: '8+ years',
    10: '10+ years',
    15: '15+ years',
  };
  return map[opt] ?? opt;
}

function ColumnWidthInput({ col, onColumnWidthChange }) {
  const min = minWidthForColumnKey(col.key);
  const committed = clampTableColumnWidth(col.width, { min }) ?? min;
  const [draft, setDraft] = useState(String(committed));

  useEffect(() => {
    setDraft(String(committed));
  }, [committed]);

  const commit = (raw) => {
    onColumnWidthChange?.(col.key, raw);
    const next = clampTableColumnWidth(raw, { min });
    setDraft(String(next ?? committed));
  };

  return (
    <label className="inline-flex items-center gap-1 shrink-0 text-[10px] text-slate-400">
      <input
        type="number"
        min={min}
        max={TABLE_COL_MAX_WIDTH}
        step="8"
        value={draft}
        aria-label={`${col.label} column width`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          if (Number.isFinite(n) && n >= min && n <= TABLE_COL_MAX_WIDTH) {
            onColumnWidthChange?.(col.key, n);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        className="w-14 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-700 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
      />
      px
    </label>
  );
}

export default function UsersFilters({
  searchQ,
  onSearchChange,
  filters,
  onFiltersChange,
  onClear,
  columns,
  onMoveColumn,
  onToggleColumn,
  onColumnWidthChange,
  onResetColumnWidths,
  draggingColumnKey,
  setDraggingColumnKey,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef(null);

  const chips = getFilterChips(filters);
  const hasActive = chips.length > 0 || searchQ.trim();

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [filtersOpen]);

  useEffect(() => {
    const onClick = (e) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target)) setColumnsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFiltersOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  const removeChip = (filterKey) => {
    const next = { ...filters };
    delete next[filterKey];
    onFiltersChange(next);
  };

  const saveView = () => {
    const name = window.prompt('Name this view:');
    if (!name?.trim()) return;
    try {
      const existing = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]');
      existing.push({ id: Date.now(), name: name.trim(), filters, savedAt: new Date().toISOString() });
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(existing.slice(-20)));
      window.alert('View saved locally.');
    } catch {
      window.alert('Could not save view.');
    }
  };

  const toolBtn =
    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors';

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[180px]">
          <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" aria-hidden />
          <input
            type="search"
            value={searchQ}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, email, phone, company, trade, ZIP..."
            className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200/90 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tf-blue/20 focus:border-tf-blue/40 shadow-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQ.trim() && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <FaTimes className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`${toolBtn} ${
            chips.length
              ? 'border-tf-blue/30 bg-blue-50/60 text-tf-blue'
              : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FaFilter className="w-3 h-3" />
          Filters
          {chips.length > 0 && (
            <span className="ml-0.5 bg-tf-blue text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center">
              {chips.length}
            </span>
          )}
        </button>
        {hasActive && (
          <button type="button" onClick={onClear} className={`${toolBtn} border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100`}>
            <FaTimes className="w-2.5 h-2.5" />
            Clear
          </button>
        )}
        <button type="button" onClick={saveView} className={`${toolBtn} border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50`}>
          Save view
        </button>
        <div className="relative" ref={columnsRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((v) => !v)}
            className={`${toolBtn} border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50`}
          >
            <FaCog className="w-3 h-3" />
            Columns
          </button>
          {columnsOpen && (
            <>
              <button type="button" className="fixed inset-0 z-30" aria-label="Close columns" onClick={() => setColumnsOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-80 rounded-lg border border-slate-200 bg-white shadow-xl p-2.5">
                <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wide font-semibold">Visible columns</p>
                <ul className="space-y-1 max-h-64 overflow-auto">
                  {columns.map((col) => (
                    <li
                      key={col.key}
                      draggable
                      onDragStart={(e) => {
                        if (e.target.closest('input')) {
                          e.preventDefault();
                          return;
                        }
                        setDraggingColumnKey?.(col.key);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        onMoveColumn?.(draggingColumnKey, col.key);
                        setDraggingColumnKey?.(null);
                      }}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1 bg-slate-50/50 text-xs"
                    >
                      <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" checked={col.visible} onChange={() => onToggleColumn?.(col.key)} className="rounded border-slate-300" />
                        <span className="truncate">{col.label}</span>
                      </label>
                      <ColumnWidthInput col={col} onColumnWidthChange={onColumnWidthChange} />
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onResetColumnWidths?.()}
                  className="mt-2 w-full rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  Reset widths
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip.filterKey}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100/90 border border-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {chip.label}
              <button type="button" onClick={() => removeChip(chip.filterKey)} className="text-slate-400 hover:text-slate-700 p-0.5" aria-label={`Remove ${chip.label}`}>
                <FaTimes className="w-2 h-2" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Advanced filters panel */}
      {filtersOpen && (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col sm:max-w-xs">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Refine the user list</p>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100">
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {FILTER_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-[11px] font-medium text-slate-600">{field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      value={filters[field.key] || ''}
                      onChange={(e) => updateFilter(field.key, e.target.value)}
                      className={`mt-1 ${fieldClass}`}
                    >
                      {field.options.map((opt) => (
                        <option key={opt || 'all'} value={opt}>{optionLabel(opt)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={filters[field.key] || ''}
                      onChange={(e) => updateFilter(field.key, e.target.value)}
                      className={`mt-1 ${fieldClass}`}
                      placeholder="Contains..."
                    />
                  )}
                  {field.disabledNote && (
                    <p className="mt-0.5 text-[10px] text-slate-400">{field.disabledNote}</p>
                  )}
                </label>
              ))}
            </div>
            <div className="shrink-0 flex gap-2 p-3 border-t border-slate-100 bg-slate-50/50">
              <button type="button" onClick={() => { onClear(); setFiltersOpen(false); }} className="flex-1 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50">
                Clear all
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="flex-1 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
