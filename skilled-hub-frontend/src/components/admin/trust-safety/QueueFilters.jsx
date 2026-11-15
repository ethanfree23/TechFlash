import React, { useEffect, useState } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { REVIEW_TYPE_OPTIONS, STATUS_OPTIONS, SORT_OPTIONS, DEFAULT_QUEUE_FILTERS } from '../../../utils/trustSafety';

const selectClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-tf-blue/40 focus:border-tf-blue';

export default function QueueFilters({ filters, lockReviewType = false, onChange, onReset, showStatus = true }) {
  const [draftQ, setDraftQ] = useState(filters.q || '');
  const [draftTrade, setDraftTrade] = useState(filters.trade || '');
  const [draftState, setDraftState] = useState(filters.state || '');

  useEffect(() => setDraftQ(filters.q || ''), [filters.q]);
  useEffect(() => setDraftTrade(filters.trade || ''), [filters.trade]);
  useEffect(() => setDraftState(filters.state || ''), [filters.state]);

  // Debounce free-text inputs so each keystroke does not hit the API.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (draftQ !== (filters.q || '') || draftTrade !== (filters.trade || '') || draftState !== (filters.state || '')) {
        onChange({ q: draftQ, trade: draftTrade, state: draftState, page: 1 });
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQ, draftTrade, draftState]);

  const dirty =
    (filters.q || '') !== '' ||
    (filters.trade || '') !== '' ||
    (filters.state || '') !== '' ||
    (!lockReviewType && filters.review_type !== DEFAULT_QUEUE_FILTERS.review_type) ||
    filters.sort !== DEFAULT_QUEUE_FILTERS.sort;

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-white rounded-t-xl">
      <label className="relative flex-1 min-w-[12rem]">
        <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          placeholder="Search technician name or email…"
          aria-label="Search technicians"
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tf-blue/40 focus:border-tf-blue"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {!lockReviewType && (
          <select
            value={filters.review_type}
            onChange={(e) => onChange({ review_type: e.target.value, page: 1 })}
            className={selectClass}
            aria-label="Review type"
          >
            {REVIEW_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {showStatus && (
          <select value={filters.status} onChange={(e) => onChange({ status: e.target.value, page: 1 })} className={selectClass} aria-label="Status">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        <input
          value={draftTrade}
          onChange={(e) => setDraftTrade(e.target.value)}
          placeholder="Trade"
          aria-label="Filter by trade"
          className="h-8 w-28 rounded-md border border-slate-200 bg-white px-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tf-blue/40"
        />
        <input
          value={draftState}
          onChange={(e) => setDraftState(e.target.value)}
          placeholder="State"
          aria-label="Filter by state"
          className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tf-blue/40"
        />
        <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value, page: 1 })} className={selectClass} aria-label="Sort">
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 h-8 rounded-md px-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            <FaTimes className="h-2.5 w-2.5" aria-hidden="true" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
