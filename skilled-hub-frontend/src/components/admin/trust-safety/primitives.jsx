import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaExternalLinkAlt } from 'react-icons/fa';
import StatusBadge from '../command-center/StatusBadge';
import { mediaUrlWithCacheBust } from '../../../utils/mediaUrl';
import { toneToBadgeVariant, priorityPresentation } from '../../../utils/trustSafety';

const AVATAR_SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function TechnicianAvatar({ technician, size = 'sm' }) {
  const [broken, setBroken] = useState(false);
  const url = technician?.avatar_url;
  useEffect(() => setBroken(false), [url]);
  const src = url && !broken ? mediaUrlWithCacheBust(url, technician?.avatar_updated_at) : null;
  return (
    <div
      className={`${AVATAR_SIZES[size] || AVATAR_SIZES.sm} shrink-0 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/80 overflow-hidden flex items-center justify-center font-bold text-slate-600`}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        technician?.initials || '?'
      )}
    </div>
  );
}

/**
 * The canonical "who is this?" cell. Always a real name (or a clearly labelled
 * fallback), with trade/location and the account link underneath.
 */
export function TechnicianCell({ technician, compact = false, showIds = false, stopPropagation = true }) {
  if (!technician) {
    return <span className="text-xs text-slate-400">Unknown technician</span>;
  }
  const meta = [technician.trade, technician.location_label].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <TechnicianAvatar technician={technician} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            to={technician.admin_user_path || `/admin/users/${technician.user_id}`}
            onClick={(e) => stopPropagation && e.stopPropagation()}
            className="text-xs font-semibold text-slate-900 hover:text-tf-blue hover:underline truncate leading-tight"
            title={`Open ${technician.display_name}'s account`}
          >
            {technician.display_name}
          </Link>
          {!technician.has_real_name && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 leading-4 shrink-0">No name on file</span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
          {meta || technician.email || '—'}
        </div>
        {showIds && (
          <div className="text-[10px] text-slate-400 truncate leading-tight mt-0.5 tabular-nums">
            User #{technician.user_id}
            {technician.technician_profile_id ? ` · Profile #${technician.technician_profile_id}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export function ItemStatusBadge({ status }) {
  if (!status) return <StatusBadge variant="default">—</StatusBadge>;
  return <StatusBadge variant={toneToBadgeVariant(status.tone)}>{status.label}</StatusBadge>;
}

export function PriorityBadge({ priority }) {
  const p = priorityPresentation(priority);
  return (
    <span title={priority?.reason || ''} className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          p.variant === 'danger' ? 'bg-red-500' : p.variant === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
        }`}
      />
      <span className={`text-[11px] font-medium ${p.variant === 'danger' ? 'text-red-700' : p.variant === 'warning' ? 'text-amber-800' : 'text-slate-500'}`}>
        {p.label}
      </span>
    </span>
  );
}

export function ExternalLink({ href, children, className = '' }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1 text-xs font-medium text-tf-blue hover:underline ${className}`}
    >
      {children}
      <FaExternalLinkAlt className="h-2.5 w-2.5" aria-hidden="true" />
    </a>
  );
}

export function Pagination({ pagination, onPageChange, onPerPageChange, perPageOptions = [25, 50, 100] }) {
  if (!pagination) return null;
  const { page = 1, per_page: perPage = 25, total = 0, total_pages: totalPages = 0 } = pagination;
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(total, page * perPage);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {total === 0 ? 'No results' : `${start}–${end} of ${total.toLocaleString()}`}
        </span>
        {onPerPageChange && (
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
            aria-label="Rows per page"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
        >
          Previous
        </button>
        <span className="px-2 tabular-nums">
          Page {totalPages === 0 ? 0 : page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3 px-3 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: `${55 + ((r + c) % 4) * 12}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 text-lg">✓</div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3" role="alert">
      <span>{message || 'Something went wrong.'}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-xs font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div>
            {title && <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function KeyValue({ label, value, mono = false, muted = false }) {
  const display = value == null || value === '' ? '—' : value;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-xs mt-0.5 break-words ${mono ? 'font-mono' : ''} ${muted || display === '—' ? 'text-slate-400' : 'text-slate-800'}`}>{display}</dd>
    </div>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px] text-slate-600 leading-4">{children}</kbd>
  );
}
