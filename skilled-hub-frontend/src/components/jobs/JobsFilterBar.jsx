import React, { useState } from 'react';
import {
  FaChevronDown,
  FaChevronUp,
  FaFilter,
  FaSearch,
  FaSlidersH,
  FaTimes,
} from 'react-icons/fa';
import { TRADE_OPTIONS } from '../../constants/trades';
import { DATE_RANGE_OPTIONS, hasActiveClientFilters } from '../../utils/jobFilterEngine';
import { EXPERIENCE_YEAR_OPTIONS } from '../../constants/experienceSelect';

const selectClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';
const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';

function FilterSelect({ label, value, onChange, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={onChange} className={selectClass} aria-label={label}>
        {children}
      </select>
    </label>
  );
}

const TRADE_OPTIONS_EL = (tradeOptions) => (
  <>
    <option value="">All trades</option>
    {TRADE_OPTIONS.map((t) => (
      <option key={t} value={t}>
        {t}
      </option>
    ))}
    {(tradeOptions || [])
      .filter((t) => !TRADE_OPTIONS.includes(t))
      .map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
  </>
);

export default function JobsFilterBar({
  config,
  role,
  serverFilters,
  clientFilters,
  setClientFilters,
  searchInput,
  setSearchInput,
  sortBy,
  setSortBy,
  locations,
  tradeOptions,
  onServerFilterChange,
  onStatusChange,
  onSearch,
  onClear,
  onSaveView,
  showSaveView,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fields = config.filterFields || [];
  const hasAdvancedPanel =
    fields.includes('dateRange') ||
    fields.includes('licenseClass') ||
    fields.includes('experience') ||
    fields.includes('startDate') ||
    fields.includes('payRange') ||
    fields.includes('distance');

  const handleClientChange = (name, value) => {
    setClientFilters((prev) => ({ ...prev, [name]: value }));
  };

  const activeFilterCount =
    (serverFilters.keyword ? 1 : 0) +
    (serverFilters.location ? 1 : 0) +
    (serverFilters.status ? 1 : 0) +
    (hasActiveClientFilters(clientFilters) ? 1 : 0);

  const searchPlaceholder =
    role === 'company'
      ? 'Search my jobs…'
      : role === 'admin'
        ? 'Search jobs, companies, trades…'
        : 'Search available jobs…';

  return (
    <div className="mb-6 rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      {/* Primary toolbar */}
      <div className="flex flex-col gap-3 px-3 py-3.5 sm:px-4 lg:flex-row lg:items-center lg:gap-3">
        {fields.includes('search') && (
          <div className="relative flex-1 min-w-0 lg:max-w-md xl:max-w-lg">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              className={`${inputClass} pl-9`}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 flex-1 lg:justify-end">
          {fields.includes('location') && (
            <FilterSelect
              label="Location"
              value={serverFilters.location}
              onChange={(e) => onServerFilterChange('location', e.target.value)}
              className="w-[10rem] sm:w-[11rem]"
            >
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </FilterSelect>
          )}

          {fields.includes('status') && (
            <FilterSelect
              label="Status"
              value={serverFilters.status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-[8.5rem] sm:w-[9rem]"
            >
              {config.statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </FilterSelect>
          )}

          {fields.includes('trade') && (
            <FilterSelect
              label="Trade"
              value={clientFilters.trade}
              onChange={(e) => handleClientChange('trade', e.target.value)}
              className="w-[8.5rem] sm:w-[9.5rem] hidden sm:block"
            >
              {TRADE_OPTIONS_EL(tradeOptions)}
            </FilterSelect>
          )}

          {fields.includes('sort') && (
            <FilterSelect
              label="Sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-[8.5rem] hidden md:block"
            >
              {config.sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </FilterSelect>
          )}

          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={onSearch}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <FaSearch className="h-3 w-3" />
              Search
            </button>

            {hasAdvancedPanel && (
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  showAdvanced || hasActiveClientFilters(clientFilters)
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FaSlidersH className="h-3 w-3" />
                <span className="hidden sm:inline">Filters</span>
                {showAdvanced ? <FaChevronUp className="h-3 w-3" /> : <FaChevronDown className="h-3 w-3" />}
              </button>
            )}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                title="Clear all filters"
              >
                <FaTimes className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile-only: trade + sort */}
      <div className="border-t border-slate-100 px-3 py-3 grid grid-cols-2 gap-2 sm:hidden">
        {fields.includes('trade') && (
          <FilterSelect
            label="Trade"
            value={clientFilters.trade}
            onChange={(e) => handleClientChange('trade', e.target.value)}
          >
            {TRADE_OPTIONS_EL(tradeOptions)}
          </FilterSelect>
        )}
        {fields.includes('sort') && (
          <FilterSelect label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {config.sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </FilterSelect>
        )}
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && hasAdvancedPanel && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
            {fields.includes('distance') && (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Max distance (mi)
                </span>
                <input
                  type="number"
                  min="1"
                  placeholder="Any"
                  value={clientFilters.maxDistanceMiles}
                  onChange={(e) => handleClientChange('maxDistanceMiles', e.target.value)}
                  className={inputClass}
                />
              </label>
            )}

            {fields.includes('dateRange') && (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Posted
                </span>
                <select
                  value={clientFilters.dateRange}
                  onChange={(e) => handleClientChange('dateRange', e.target.value)}
                  className={selectClass}
                >
                  {DATE_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.id || 'any'} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {fields.includes('licenseClass') && (
              <label className="col-span-2 sm:col-span-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  License / class
                </span>
                <input
                  type="text"
                  placeholder="Journeyman…"
                  value={clientFilters.licenseClass}
                  onChange={(e) => handleClientChange('licenseClass', e.target.value)}
                  className={inputClass}
                />
              </label>
            )}

            {fields.includes('experience') && (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Max experience
                </span>
                <select
                  value={clientFilters.maxExperience}
                  onChange={(e) => handleClientChange('maxExperience', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Any</option>
                  {EXPERIENCE_YEAR_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Up to {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {fields.includes('startDate') && (
              <>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Starts after
                  </span>
                  <input
                    type="date"
                    value={clientFilters.startDateFrom}
                    onChange={(e) => handleClientChange('startDateFrom', e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Starts before
                  </span>
                  <input
                    type="date"
                    value={clientFilters.startDateTo}
                    onChange={(e) => handleClientChange('startDateTo', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </>
            )}

            {fields.includes('payRange') && (
              <>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Min $/hr
                  </span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Any"
                    value={clientFilters.minPayCents ? clientFilters.minPayCents / 100 : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleClientChange('minPayCents', val === '' ? '' : Math.round(Number(val) * 100));
                    }}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Max $/hr
                  </span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Any"
                    value={clientFilters.maxPayCents ? clientFilters.maxPayCents / 100 : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleClientChange('maxPayCents', val === '' ? '' : Math.round(Number(val) * 100));
                    }}
                    className={inputClass}
                  />
                </label>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showSaveView && (
              <button
                type="button"
                onClick={onSaveView}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Save view
              </button>
            )}
            {role === 'admin' && (
              <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                <FaFilter className="h-2.5 w-2.5" />
                Extended filters run client-side
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
