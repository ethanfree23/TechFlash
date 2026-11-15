import React, { useEffect, useState } from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { TechnicianCell, Pagination, TableSkeleton, EmptyState, ErrorState } from './primitives';
import { formatRelative, toneToBadgeVariant } from '../../../utils/trustSafety';

const VERIFICATION_OPTIONS = [
  { value: 'all', label: 'All technicians' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'verified', label: 'Background-verified' },
  { value: 'unverified', label: 'Not background-verified' },
];

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function TechnicianFilters({ filters, onChange }) {
  const [q, setQ] = useState(filters.q || '');
  const [trade, setTrade] = useState(filters.trade || '');
  const [state, setState] = useState(filters.state || '');
  const dq = useDebounced(q);
  const dTrade = useDebounced(trade);
  const dState = useDebounced(state);

  useEffect(() => setQ(filters.q || ''), [filters.q]);
  useEffect(() => setTrade(filters.trade || ''), [filters.trade]);
  useEffect(() => setState(filters.state || ''), [filters.state]);

  useEffect(() => {
    if (dq !== (filters.q || '') || dTrade !== (filters.trade || '') || dState !== (filters.state || '')) {
      onChange({ q: dq, trade: dTrade, state: dState, page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, dTrade, dState]);

  const inputCls = 'h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tf-blue/30 focus:border-tf-blue';
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className={`${inputCls} flex-1 min-w-[12rem]`} aria-label="Search technicians" />
      <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Trade" className={`${inputCls} lg:w-40`} aria-label="Filter by trade" />
      <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="State" className={`${inputCls} lg:w-20 uppercase`} aria-label="Filter by state" />
      <select value={filters.verification || 'all'} onChange={(e) => onChange({ verification: e.target.value, page: 1 })} className={`${inputCls} lg:w-52`} aria-label="Verification filter">
        {VERIFICATION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select value={filters.sort || 'name'} onChange={(e) => onChange({ sort: e.target.value, page: 1 })} className={`${inputCls} lg:w-40`} aria-label="Sort technicians">
        <option value="name">Name A–Z</option>
        <option value="newest">Newest accounts</option>
        <option value="oldest">Oldest accounts</option>
      </select>
    </div>
  );
}

function Counter({ label, value, tone }) {
  const color = tone === 'warning' ? 'text-amber-800' : tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-red-700' : 'text-slate-600';
  return (
    <span className={`text-[11px] ${color}`}>
      <span className="font-semibold tabular-nums">{value}</span> {label}
    </span>
  );
}

export default function TechniciansTable({ rows, pagination, loading, error, onOpenTechnician, onOpenItem, onPageChange, onPerPageChange, onRetry }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !rows) return <TableSkeleton rows={8} cols={5} />;
  if (!rows?.length) return <EmptyState title="No technicians match" description="Adjust the search or verification filter." />;

  return (
    <div>
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Technician</th>
              <th className="px-3 py-2.5">Background check</th>
              <th className="px-3 py-2.5">Credentials</th>
              <th className="px-3 py-2.5">References</th>
              <th className="px-3 py-2.5">Pending</th>
              <th className="px-3 py-2.5">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const t = row.technician;
              return (
                <tr key={t.user_id} className="hover:bg-slate-50/80 cursor-pointer" onClick={() => onOpenTechnician(t.user_id)}>
                  <td className="px-3 py-2.5">
                    <TechnicianCell technician={t} showIds />
                  </td>
                  <td className="px-3 py-2.5">
                    {row.background_check ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenItem(row.background_check.key);
                        }}
                        className="text-left"
                        title="Open background check"
                      >
                        <StatusBadge variant={toneToBadgeVariant(row.background_check.status?.tone)}>{row.background_check.status?.label}</StatusBadge>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Not started</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <Counter label="approved" value={row.credentials.approved} tone="success" />
                      {row.credentials.pending > 0 && <Counter label="awaiting review" value={row.credentials.pending} tone="warning" />}
                      {row.credentials.expired > 0 && <Counter label="expired" value={row.credentials.expired} tone="danger" />}
                      {row.credentials.total === 0 && <span className="text-[11px] text-slate-400">None uploaded</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <Counter label="verified" value={row.references.approved} tone="success" />
                      {row.references.responded > 0 && <Counter label="awaiting review" value={row.references.responded} tone="warning" />}
                      {row.references.requested > 0 && <Counter label="awaiting response" value={row.references.requested} />}
                      {row.references.total === 0 && <span className="text-[11px] text-slate-400">None requested</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.pending_review_count > 0 ? (
                      <StatusBadge variant="warning">{row.pending_review_count} to review</StatusBadge>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">{formatRelative(row.last_activity_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.technician.user_id} className="px-3 py-3" onClick={() => onOpenTechnician(row.technician.user_id)}>
            <div className="flex items-center justify-between gap-2">
              <TechnicianCell technician={row.technician} compact />
              {row.pending_review_count > 0 && <StatusBadge variant="warning">{row.pending_review_count}</StatusBadge>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
              <span>BG: {row.background_check?.status?.label || 'Not started'}</span>
              <span>Credentials: {row.credentials.approved}/{row.credentials.total}</span>
              <span>References: {row.references.approved}/{row.references.total}</span>
            </div>
          </li>
        ))}
      </ul>
      <Pagination pagination={pagination} onPageChange={onPageChange} onPerPageChange={onPerPageChange} />
    </div>
  );
}
