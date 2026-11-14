import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminTrustSafetyAPI } from '../../../api/api';
import AuditTimeline from './AuditTimeline';
import { Pagination, TableSkeleton, EmptyState, ErrorState } from './primitives';

const ACTION_FILTERS = [
  { value: '', label: 'All activity' },
  { value: 'background_check_override', label: 'Background check overrides' },
  { value: 'document_approved', label: 'Documents approved' },
  { value: 'document_rejected', label: 'Documents rejected' },
  { value: 'document_rereviewed', label: 'Document decisions changed' },
  { value: 'document_info_requested', label: 'Document info requests' },
  { value: 'reference_approved', label: 'References verified' },
  { value: 'reference_rejected', label: 'References rejected' },
  { value: 'reference_rereviewed', label: 'Reference decisions changed' },
  { value: 'reference_contact_attempt', label: 'Reference contact attempts' },
  { value: 'reviewer_note', label: 'Reviewer notes' },
];

/**
 * Immutable audit history across every technician, with server-side filtering and paging.
 */
export default function ActivityFeed({ technicianUserId = null, refreshToken = 0, onOpenItem }) {
  const [filters, setFilters] = useState({ q: '', event_action: '', page: 1, per_page: 50 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === q ? f : { ...f, q, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const res = await adminTrustSafetyAPI.audit({ ...filters, technician_user_id: technicianUserId || undefined }, { signal: controller.signal });
      setData(res);
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Could not load activity.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, technicianUserId]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load, refreshToken]);

  const inputCls = 'h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-tf-blue/30 focus:border-tf-blue';

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 px-3 py-3 border-b border-slate-100">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reviewer, technician, or reason…" className={`${inputCls} flex-1`} aria-label="Search activity" />
        <select value={filters.event_action} onChange={(e) => setFilters((f) => ({ ...f, event_action: e.target.value, page: 1 }))} className={`${inputCls} sm:w-64`} aria-label="Filter by action">
          {ACTION_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !data ? (
        <TableSkeleton rows={6} cols={3} />
      ) : !data?.events?.length ? (
        <EmptyState title="No activity yet" description="Reviewer decisions, overrides, notes, and information requests will appear here." />
      ) : (
        <div className={`px-4 py-4 ${loading ? 'opacity-60' : ''}`}>
          <AuditTimeline events={data.events} showTechnician={!technicianUserId} onOpenItem={onOpenItem} />
        </div>
      )}
      {data?.pagination && (
        <Pagination
          pagination={data.pagination}
          onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
          onPerPageChange={(per_page) => setFilters((f) => ({ ...f, per_page, page: 1 }))}
          perPageOptions={[50, 100, 200]}
        />
      )}
    </div>
  );
}
