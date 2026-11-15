import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaExternalLinkAlt } from 'react-icons/fa';
import { adminTrustSafetyAPI } from '../../../api/api';
import StatusBadge from '../command-center/StatusBadge';
import { ItemStatusBadge, ErrorState } from './primitives';
import { formatDateTime, formatRelative, toneToBadgeVariant, buildWorkspaceSearch } from '../../../utils/trustSafety';

const STATUS_DOT = {
  verified: 'bg-emerald-500',
  needs_review: 'bg-amber-500',
  pending: 'bg-sky-500',
  rejected: 'bg-red-500',
  expired: 'bg-red-400',
  incomplete: 'bg-slate-400',
  not_started: 'bg-slate-300',
  not_applicable: 'bg-slate-200',
};

function reviewLink(userId, itemRef) {
  return `/admin/trust-safety${buildWorkspaceSearch({ tab: 'queue', filters: { status: 'all' }, technician: userId, item: itemRef || null })}`;
}

function ChecklistRow({ row, userId }) {
  const [open, setOpen] = useState(false);
  const hasDocs = row.documents?.length > 0;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[row.status] || 'bg-slate-300'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            <StatusBadge variant={toneToBadgeVariant(row.tone)}>{row.status_label}</StatusBadge>
            {row.optional && <span className="text-[10px] text-slate-400">optional</span>}
            {row.recorded_status && row.recorded_status !== row.status && (
              <span className="text-[10px] text-slate-400" title="Status stored on the verification profile record">
                recorded: {String(row.recorded_status).replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {row.detail && <p className="mt-0.5 text-xs text-slate-600">{row.detail}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {row.updated_at && <span title={formatDateTime(row.updated_at)}>Updated {formatRelative(row.updated_at)}</span>}
            {row.reviewer?.name && <span>Reviewer: {row.reviewer.name}</span>}
            {row.provider_result && <span>Checkr: {row.provider_result}</span>}
            {row.override && <span className="font-medium">Override: {String(row.override).replace(/_/g, ' ')}</span>}
            {row.expires_at && <span>Expires {formatDateTime(row.expires_at)}</span>}
            {row.counts && (
              <span>
                {row.counts.approved} verified · {row.counts.responded} awaiting review · {row.counts.requested} awaiting response
                {row.counts.rejected ? ` · ${row.counts.rejected} rejected` : ''}
              </span>
            )}
          </div>
          {row.next_action && (
            <p className="mt-1.5 text-xs text-slate-700">
              <span className="font-semibold text-slate-500">Next:</span> {row.next_action}
            </p>
          )}
          {hasDocs && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[11px] font-medium text-tf-blue hover:underline">
              {open ? 'Hide' : 'Show'} {row.documents.length} document{row.documents.length === 1 ? '' : 's'}
            </button>
          )}
          {open && hasDocs && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60">
              {row.documents.map((doc) => (
                <li key={doc.key} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{doc.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {doc.review_type_label}
                      {doc.subtitle ? ` · ${doc.subtitle}` : ''}
                      {doc.expires_at ? ` · exp. ${formatDateTime(doc.expires_at)}` : ''}
                      {!doc.has_file ? ' · no file' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ItemStatusBadge status={doc.status} />
                    <Link to={reviewLink(userId, doc.key)} className="text-[11px] font-medium text-tf-blue hover:underline">
                      Review
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {row.item_ref && (
          <Link
            to={reviewLink(userId, row.item_ref)}
            className="shrink-0 inline-flex items-center gap-1 h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Review <FaExternalLinkAlt className="h-2.5 w-2.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Account-level trust profile shown on the Admin User Detail page. Every status is
 * derived server-side from the actual records (TrustSafety::TrustProfile); nothing is
 * inferred from a single clear background check.
 */
export default function TrustProfileChecklist({ userId, isTechnician = true }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminTrustSafetyAPI.technician(userId);
      setProfile(res?.trust_profile || null);
    } catch (e) {
      if (e?.status === 422) {
        setProfile(null);
      } else {
        setError(e?.message || 'Could not load the trust profile.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isTechnician) {
    return <p className="text-sm text-slate-500">Trust &amp; Safety checks apply to technician accounts only.</p>;
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (loading && !profile) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!profile) return <p className="text-sm text-slate-500">This account has no technician profile, so there is nothing to verify.</p>;

  const s = profile.summary || {};
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <FaShieldAlt className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Trust profile</p>
              <p className="text-[11px] text-slate-500">
                {s.verified_count}/{s.total} checks verified
                {s.needs_review_count > 0 ? ` · ${s.needs_review_count} need review` : ''}
                {' · '}
                Background-verified flag: <span className={s.background_verified ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>{s.background_verified ? 'on' : 'off'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(profile.badges || []).map((b) => (
              <StatusBadge key={b.badge_type} variant={b.status === 'active' ? 'success' : 'neutral'}>
                {String(b.badge_type).replace(/_/g, ' ')} · {b.status}
              </StatusBadge>
            ))}
            <Link to={reviewLink(userId, null)} className="inline-flex items-center gap-1 h-8 rounded-md bg-tf-blue px-3 text-xs font-semibold text-white hover:bg-tf-blue/90">
              Open in Trust &amp; Safety <FaExternalLinkAlt className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {(profile.checklist || []).map((row) => (
            <ChecklistRow key={row.key} row={row} userId={userId} />
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-slate-400">
        Statuses reflect the current business rules: a clear background check does not verify credentials or references, and reviewer approval of a document is not an issuing-authority verification.
      </p>
    </div>
  );
}
